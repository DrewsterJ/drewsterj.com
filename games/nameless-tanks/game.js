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
  const LOW_MASS = 30; // below this the heartbeat starts
  const STICK_R = 62; // touch stick throw, in canvas units

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const AIM_ERROR = Number(params.get('aim')) || 0.06; // autoplay aim wobble, in radians
  const REACT = Number(params.get('react')) || 0.25; // autoplay reaction time, in seconds
  const SEED_PARAM = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
  const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Gun fields: a = angle offset, off = sideways offset, dmg, rate (seconds
  // between shots), spd, size, and optional pierce, spread, explode (radius),
  // home, split, bomblets, ring (fires in every direction).
  const FORMS = {
    seed: {
      name: 'Seed', tier: 0, speed: 235, r: 15, color: '#67e8f9', next: ['twin', 'lancer'],
      desc: 'A single cannon.',
      guns: [{ a: 0, off: 0, dmg: 10, rate: 0.28, spd: 560, size: 4 }],
    },
    twin: {
      name: 'Twin', tier: 1, speed: 230, r: 19, color: '#67e8f9', next: ['spread', 'swarm'], parent: 'seed',
      desc: 'Two quick parallel cannons.',
      guns: [
        { a: 0, off: -7, dmg: 10, rate: 0.22, spd: 580, size: 4 },
        { a: 0, off: 7, dmg: 10, rate: 0.22, spd: 580, size: 4, delay: 0.11 },
      ],
    },
    lancer: {
      name: 'Lancer', tier: 1, speed: 220, r: 19, color: '#93c5fd', next: ['rail', 'mortar'], parent: 'seed',
      desc: 'Slow, heavy lances that pierce two enemies.',
      guns: [{ a: 0, off: 0, dmg: 30, rate: 0.5, spd: 900, size: 5, pierce: 2 }],
    },
    spread: {
      name: 'Spread', tier: 2, speed: 225, r: 23, color: '#5eead4', next: ['nova'], parent: 'twin',
      desc: 'A five-way fan of shots.',
      guns: [-0.32, -0.16, 0, 0.16, 0.32].map((a) => ({ a, off: 0, dmg: 10, rate: 0.3, spd: 560, size: 4 })),
    },
    swarm: {
      name: 'Swarm', tier: 2, speed: 245, r: 23, color: '#7dd3fc', next: ['hive'], parent: 'twin',
      desc: 'A rapid gatling, plus a rear gun.',
      guns: [
        { a: 0, off: 0, dmg: 8, rate: 0.075, spd: 620, size: 3.5, spread: 0.07 },
        { a: Math.PI, off: 0, dmg: 8, rate: 0.2, spd: 520, size: 3.5 },
      ],
    },
    rail: {
      name: 'Rail', tier: 2, speed: 210, r: 23, color: '#a5b4fc', next: ['prism'], parent: 'lancer',
      desc: 'A rail gun that punches through five enemies.',
      guns: [{ a: 0, off: 0, dmg: 70, rate: 0.75, spd: 1400, size: 5.5, pierce: 5 }],
    },
    mortar: {
      name: 'Mortar', tier: 2, speed: 215, r: 23, color: '#fdba74', next: ['cluster'], parent: 'lancer',
      desc: 'Slow shells that explode on impact.',
      guns: [{ a: 0, off: 0, dmg: 28, rate: 0.62, spd: 440, size: 7, explode: 75 }],
    },
    nova: {
      name: 'Nova', tier: 3, speed: 225, r: 28, color: '#99f6e4', next: [], parent: 'spread',
      desc: 'A wide fan, and a burst in every direction.',
      guns: [
        ...[-0.4, -0.2, 0, 0.2, 0.4].map((a) => ({ a, off: 0, dmg: 13, rate: 0.26, spd: 600, size: 4.5 })),
        { a: 0, off: 0, dmg: 10, rate: 0.85, spd: 420, size: 4, ring: 12 },
      ],
    },
    hive: {
      name: 'Hive', tier: 3, speed: 255, r: 28, color: '#fcd34d', next: [], parent: 'swarm',
      desc: 'A gatling and two streams of homing drones.',
      guns: [
        { a: 0, off: 0, dmg: 10, rate: 0.07, spd: 660, size: 3.5, spread: 0.05 },
        { a: 1.2, off: 0, dmg: 12, rate: 0.28, spd: 360, size: 4, home: true },
        { a: -1.2, off: 0, dmg: 12, rate: 0.28, spd: 360, size: 4, home: true, delay: 0.14 },
      ],
    },
    prism: {
      name: 'Prism', tier: 3, speed: 215, r: 28, color: '#c4b5fd', next: [], parent: 'rail',
      desc: 'Piercing beams that split into three on every hit.',
      guns: [{ a: 0, off: 0, dmg: 90, rate: 0.65, spd: 1500, size: 6, pierce: 6, split: 3 }],
    },
    cluster: {
      name: 'Cluster', tier: 3, speed: 220, r: 28, color: '#fb923c', next: [], parent: 'mortar',
      desc: 'Big shells that burst into six bomblets.',
      guns: [{ a: 0, off: 0, dmg: 38, rate: 0.6, spd: 460, size: 8, explode: 90, bomblets: 6 }],
    },
  };

  // Enemy fields: hp, r, speed, touch (contact damage), drop (mass), color.
  // Mini-bosses carry a title and a hint for their name card.
  const ENEMIES = {
    mite: { hp: 14, r: 9, speed: 150, touch: 8, drop: 3, color: '#f472b6', sides: 3 },
    spiker: { hp: 30, r: 13, speed: 95, touch: 8, drop: 6, color: '#fb923c', sides: 4 },
    charger: { hp: 45, r: 14, speed: 70, touch: 14, drop: 8, color: '#facc15', sides: 3 },
    splitter: { hp: 40, r: 15, speed: 105, touch: 10, drop: 6, color: '#34d399', sides: 4 },
    spinner: { hp: 65, r: 17, speed: 45, touch: 10, drop: 11, color: '#a78bfa', sides: 6 },
    treasure: { hp: 55, r: 14, speed: 235, touch: 0, drop: 40, color: '#fde047', sides: 5 },
    guardian: { hp: 620, r: 38, speed: 55, touch: 20, drop: 120, color: '#ef4444', sides: 8 },
    weaver: {
      hp: 1050, r: 34, speed: 80, touch: 16, drop: 150, color: '#a3e635', sides: 6, mini: true,
      title: 'The Weaver', hint: 'It lays mines and blinks away. Keep moving.',
    },
    ram: {
      hp: 1200, r: 40, speed: 65, touch: 22, drop: 160, color: '#fb7185', sides: 3, mini: true,
      title: 'The Ram', hint: 'Watch the red line, then sidestep the charge.',
    },
    boss: { hp: 10500, r: 74, speed: 30, touch: 30, drop: 0, color: '#e879f9', sides: 7 },
  };

  // Which enemies appear, from which depth, and how common they are.
  const ROOM_MIX = [
    ['mite', 0, 10],
    ['spiker', 1, 6],
    ['charger', 2, 4],
    ['splitter', 2, 4],
    ['spinner', 3, 3],
  ];

  // One modifier per Daily Challenge, picked from the date.
  const MODS = [
    { id: 'rich', name: 'Rich veins', desc: 'Shards are worth half as much again.' },
    { id: 'swarm', name: 'Swarming', desc: 'Every room holds a third more enemies.' },
    { id: 'glass', name: 'Glass cannon', desc: 'You hit 40% harder but take 25% more damage.' },
    { id: 'events', name: 'Restless web', desc: 'Far more storms, ambushes and treasure.' },
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
  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const modIs = (id) => state.run.mod === id;

  // Small seeded generator so a seed (or today's date) always builds the same world.
  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dailyMod(date) {
    return MODS[hashStr(`mod-${date}`) % MODS.length];
  }

  // Danger colour for a level: calm teal in the shallows, red in the depths.
  function dangerColor(lvl, alpha = 1) {
    const h = 175 - 175 * clamp(lvl / MAX_LEVEL, 0, 1);
    return `hsla(${h}, 85%, 60%, ${alpha})`;
  }

  // Short gun summaries for the evolution cards and tree.
  function gunLines(f) {
    const groups = [];
    for (const g of f.guns) {
      const kind = g.ring ? 'Nova ring' : g.home ? 'Drone launcher' : g.bomblets ? 'Cluster mortar'
        : g.explode ? 'Mortar' : g.split ? 'Prism beam' : g.pierce >= 5 ? 'Rail gun' : g.pierce ? 'Lance'
          : g.spread ? 'Gatling' : g.a === Math.PI ? 'Rear gun' : 'Cannon';
      const traits = [];
      if (g.ring) traits.push(`${g.ring} ways`);
      if (g.pierce) traits.push(`pierces ${g.pierce}`);
      if (g.explode) traits.push('explodes');
      if (g.bomblets) traits.push(`${g.bomblets} bomblets`);
      if (g.home) traits.push('homing');
      if (g.split) traits.push(`splits ×${g.split}`);
      const stats = `${g.dmg} dmg · ${(1 / g.rate).toFixed(1)}/s${traits.length ? ` · ${traits.join(', ')}` : ''}`;
      const same = groups.find((x) => x.kind === kind && x.stats === stats);
      if (same) same.n++;
      else groups.push({ kind, stats, n: 1 });
    }
    return groups.map((x) => ({ label: `${x.n > 1 ? `${x.n}× ` : ''}${x.kind}`, stats: x.stats }));
  }

  // A rough firepower score, with bonuses for piercing and splash.
  function firepower(f) {
    let sum = 0;
    for (const g of f.guns) {
      let v = (g.dmg * (g.ring || 1)) / g.rate;
      if (g.pierce) v *= 1 + 0.15 * (g.pierce - 1);
      if (g.explode) v *= 2;
      if (g.bomblets) v *= 1.8;
      if (g.split) v *= 1.5;
      sum += v;
    }
    return sum;
  }

  // ---------------------------------------------------------------------------
  // Storage: best runs, daily results, settings and the tutorial flag.
  // All wrapped, because storage can be unavailable (private mode).
  // ---------------------------------------------------------------------------

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not kept; the game carries on.
    }
  }

  function loadBest() {
    return loadJSON('nameless-tanks-best', null);
  }

  function saveBest(run) {
    const best = loadBest();
    if (best && best.won && (!run.won || best.time <= run.time)) return;
    if (best && !run.won && !best.won && best.depth >= run.depth) return;
    saveJSON('nameless-tanks-best', run);
  }

  // Daily results are kept per date; only the last couple of weeks are stored.
  function loadDaily(date) {
    const all = loadJSON('nameless-tanks-daily', {});
    return (all && all[date]) || null;
  }

  function saveDaily(date, result) {
    let all = loadJSON('nameless-tanks-daily', {});
    if (!all || typeof all !== 'object') all = {};
    const prev = all[date];
    if (prev && prev.score >= result.score) return false;
    all[date] = result;
    const keys = Object.keys(all).sort();
    while (keys.length > 14) delete all[keys.shift()];
    saveJSON('nameless-tanks-daily', all);
    return true;
  }

  const settings = Object.assign(
    { shake: !REDUCED_MOTION, reduced: false, assist: true },
    loadJSON('nameless-tanks-settings', {}),
  );

  function saveSettings() {
    saveJSON('nameless-tanks-settings', settings);
  }

  const tutorialDone = () => loadJSON('nameless-tanks-tutorial', false) === true;

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth, through a soft compressor so layers never clip)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    out: null,
    muted: false,
    last: {},
    noiseBuf: null,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try {
          this.ctx = new AC();
        } catch {
          return;
        }
        const c = this.ctx;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 10;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.out = c.createGain();
        this.out.gain.value = 0.9;
        this.out.connect(comp).connect(c.destination);
        const len = c.sampleRate;
        this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
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
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    // Filtered noise; with sweepTo the filter glides (whooshes and rumbles).
    noise(dur, vol, freq, delay = 0, type = 'lowpass', sweepTo = 0) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.out);
      s.start(t, Math.random() * 0.4);
      s.stop(t + dur);
    },

    shoot(pitch = 1) {
      this.play('shoot', 0.05, () => {
        this.tone(880 * pitch, 0.06, 'square', 0.02, 420 * pitch);
        this.noise(0.03, 0.035, 5000, 0, 'highpass');
      });
    },
    heavy() {
      this.play('heavy', 0.1, () => {
        this.tone(300, 0.15, 'sawtooth', 0.05, 90);
        this.noise(0.1, 0.1, 1500);
        this.tone(80, 0.18, 'sine', 0.12, 40);
      });
    },
    enemyShot() { this.play('eshot', 0.08, () => this.tone(520, 0.08, 'triangle', 0.03, 300)); },
    hit() { this.play('hit', 0.04, () => this.noise(0.05, 0.07, 3000)); },
    shatter(size = 1) {
      this.play('shatter', 0.05, () => {
        this.noise(0.18, 0.12, 5000);
        this.tone(1200 / size, 0.12, 'triangle', 0.04, 2400 / size);
        if (size > 1.2) this.tone(120, 0.2, 'sine', 0.12, 45);
      });
    },
    bigShatter() {
      this.play('big', 0.15, () => {
        this.noise(0.7, 0.3, 3000, 0, 'lowpass', 200);
        this.tone(95, 0.6, 'sine', 0.3, 32);
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.03, null, 0.04 * i));
      });
    },
    boom() { this.play('boom', 0.08, () => { this.noise(0.4, 0.26, 500); this.tone(110, 0.3, 'sine', 0.18, 40); }); },
    absorb(pitch) {
      this.play('absorb', 0.03, () => {
        const f = 600 + pitch * 40;
        this.tone(f, 0.07, 'sine', 0.04);
        this.tone(f * 2, 0.05, 'sine', 0.012);
      });
    },
    hurt() { this.play('hurt', 0.2, () => { this.tone(220, 0.25, 'sawtooth', 0.06, 80); this.noise(0.15, 0.1, 900); }); },
    heartbeat() {
      this.play('beat', 0.25, () => {
        this.tone(64, 0.16, 'sine', 0.32, 44);
        this.tone(56, 0.2, 'sine', 0.24, 40, 0.18);
      });
    },
    portal() {
      this.play('portal', 0.3, () => {
        this.tone(300, 0.4, 'sine', 0.08, 1200);
        this.noise(0.4, 0.06, 400, 0, 'bandpass', 3000);
      });
    },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    ding() { this.play('ding', 0.1, () => { this.tone(1319, 0.25, 'sine', 0.05); this.tone(1976, 0.3, 'sine', 0.03, null, 0.07); }); },
    evolve() {
      this.play('evolve', 0.5, () => {
        this.noise(1.1, 0.12, 250, 0, 'bandpass', 5000);
        this.tone(65, 1.2, 'sine', 0.2, 130);
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.06, null, 0.25 + i * 0.07));
        [2093, 2637].forEach((f, i) => this.tone(f, 0.9, 'sine', 0.02, null, 0.7 + i * 0.1));
      });
    },
    devolve() {
      this.play('devolve', 0.5, () => {
        [659, 523, 392].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.05, null, i * 0.1));
        this.noise(0.5, 0.12, 2000, 0, 'lowpass', 150);
      });
    },
    roar() {
      this.play('roar', 0.8, () => {
        this.tone(110, 1.3, 'sawtooth', 0.1, 36);
        this.tone(55, 1.4, 'sine', 0.25, 30);
        this.noise(1.2, 0.25, 900, 0, 'lowpass', 120);
        [784, 1175].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.03, f * 0.5, 0.2 + i * 0.1));
      });
    },
    charge() { this.play('charge', 0.4, () => this.tone(180, 0.9, 'sine', 0.07, 900)); },
    zap() { this.play('zap', 0.4, () => { this.tone(140, 0.5, 'sawtooth', 0.07, 110); this.noise(0.35, 0.1, 3000, 0, 'bandpass', 800); }); },
    blink() { this.play('blink', 0.3, () => this.tone(1500, 0.2, 'sine', 0.05, 300)); },
    meteor() { this.play('meteor', 0.25, () => this.tone(1900, 0.5, 'sine', 0.025, 500)); },
    impact() { this.play('impact', 0.1, () => { this.noise(0.3, 0.2, 1200, 0, 'lowpass', 200); this.tone(90, 0.25, 'sine', 0.14, 40); }); },
    seal() {
      this.play('seal', 0.5, () => {
        this.tone(98, 0.8, 'sawtooth', 0.08, 70);
        this.tone(1568, 0.3, 'triangle', 0.04, 784);
        this.noise(0.3, 0.15, 600);
      });
    },
    treasure() {
      this.play('treasure', 0.4, () => [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.045, null, i * 0.05)));
    },
    cleared() {
      this.play('cleared', 0.5, () => [523, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, null, i * 0.09)));
    },
    win() {
      this.play('end', 1, () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, null, i * 0.12)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
  };

  // ---------------------------------------------------------------------------
  // World generation (seeded, so the Daily Challenge is the same for everyone)
  // ---------------------------------------------------------------------------

  function makeWorld(seed, loop = 0, mod = null) {
    const R = mulberry32(seed);
    const rpick = (arr) => arr[(R() * arr.length) | 0];
    const rooms = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        rooms.push({ id: gy * GRID + gx, gx, gy, links: {}, d: 0, lvl: 0, visited: false, cleared: false, pending: [] });
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
      const dir = rpick(options);
      const [dx, dy] = DIRS[dir];
      const n = at(r.gx + dx, r.gy + dy);
      link(r, dir);
      seen.add(n.id);
      stack.push(n);
    }
    for (let k = 0; k < 12; k++) {
      const r = rpick(rooms);
      const dir = rpick(Object.keys(DIRS));
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
    // Danger level runs from 0 at the start to MAX_LEVEL in the farthest rooms;
    // each Endless loop adds three levels on top.
    for (const r of rooms) {
      r.d = Math.round((MAX_LEVEL * depth.get(r.id)) / maxD);
      r.lvl = r.d + loop * 3;
    }
    const boss = rpick(rooms.filter((r) => depth.get(r.id) === maxD));
    boss.boss = true;
    const free = () => rooms.filter((r) => !r.boss && !r.guardian && !r.mini && r !== start);
    const place = (key, value, lo, hi) => {
      let c = free().filter((r) => r.d >= lo && r.d <= hi);
      if (!c.length) c = free().filter((r) => r.d >= 2);
      if (c.length) rpick(c)[key] = value;
    };
    // Mini-bosses hold the middle depths; guardians anywhere from depth 3.
    place('mini', 'weaver', 3, 5);
    place('mini', 'ram', 4, 6);
    place('guardian', true, 3, MAX_LEVEL - 1);
    place('guardian', true, 3, MAX_LEVEL - 1);
    // Room events: storms, ambushes and runaway treasure, spread around.
    const pool = free().filter((r) => r.d >= 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (R() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const kinds = ['treasure', 'storm', 'ambush'];
    const count = mod === 'events' ? 11 : 6;
    pool.slice(0, count).forEach((r, k) => {
      let kind = kinds[k % kinds.length];
      if (kind === 'ambush' && r.d < 2) kind = 'treasure';
      r.event = kind;
    });
    for (const r of rooms) r.pending = roomEnemies(r, R, mod, r === start && loop === 0);
    return { rooms, start: start.id, maxD, loop };
  }

  function roomEnemies(r, R, mod, isStart) {
    if (r.boss) return ['boss', 'spiker', 'spiker'];
    if (isStart) return ['mite', 'mite', 'mite', 'mite'];
    const mix = ROOM_MIX.filter(([, from]) => r.lvl >= from);
    const total = mix.reduce((s, [, , w]) => s + w, 0);
    const basic = (n) => {
      const list = [];
      for (let k = 0; k < n; k++) {
        let x = R() * total;
        for (const [type, , w] of mix) {
          if (x < w) { list.push(type); break; }
          x -= w;
        }
      }
      return list;
    };
    if (r.mini) return [r.mini, ...basic(2)];
    let count = Math.min(18, 3 + r.lvl * 2);
    if (mod === 'swarm') count = Math.round(count * 1.33);
    if (r.event === 'storm') count = Math.ceil(count * 0.6);
    if (r.event === 'ambush') count = 2;
    const list = basic(count);
    if (r.guardian) list.unshift('guardian');
    return list;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  const input = {
    keys: new Set(), mx: W / 2 + 100, my: H / 2, down: false, over: false,
    lastTouch: false, // the last input came from a finger
    touch: { move: null, aim: null }, // twin-stick touches: { id, ox, oy, x, y }
  };

  function newGame(opts = {}) {
    const daily = !!opts.daily;
    const date = todayKey();
    let seed = (Math.random() * 4294967296) >>> 0;
    if (opts.seed !== undefined) seed = opts.seed >>> 0;
    else if (daily) seed = hashStr(`nameless-tanks-${date}`);
    else if (SEED_PARAM !== null) seed = SEED_PARAM;
    const mod = daily ? dailyMod(date) : null;
    state = {
      mode: 'playing', // 'menu' | 'playing' | 'paused' | 'choosing' | 'tree' | 'over'
      t: 0,
      run: { daily, date, seed, mod: mod ? mod.id : null, loop: 0 },
      world: makeWorld(seed, 0, mod ? mod.id : null),
      room: null,
      player: {
        x: 0, y: 0, vx: 0, vy: 0, aim: 0,
        form: 'seed', mass: START_MASS, cds: [0], kick: [], inv: 0, flash: 0, spin: 0, gulp: 0,
      },
      enemies: [],
      bullets: [],
      foes: [], // enemy bullets
      shards: [],
      hazards: [], // falling crystals during shard storms
      spawns: [], // enemies about to warp in
      parts: [],
      frags: [], // spinning polygon fragments from shattered things
      rings: [],
      flashes: [], // soft bloom pulses
      texts: [],
      banner: null,
      card: null, // big name card (evolutions, bosses, events)
      cam: { x: 0, y: 0, zoom: 1 },
      shake: 0,
      hitstop: 0,
      chroma: 0,
      hurtT: 0,
      beat: 0,
      beatT: 0,
      fade: 0,
      portalCd: 0,
      combo: 0,
      comboT: 0,
      gain: null, // "+N" pop over the tank while absorbing
      evo: null,
      cine: null,
      event: null,
      sealed: false,
      endT: 0,
      treeSel: null,
      tut: !AUTOPLAY && !tutorialDone() ? { step: 0, t: 0, moved: 0, shots: 0, gained: 0, rooms: 0, wait: 0 } : null,
      stats: { kills: 0, rooms: 1, maxTier: 0, deepest: 0, loops: 0 },
    };
    enterRoom(state.world.start, null);
  }

  function enterRoom(id, fromDir) {
    const s = state;
    if (s.room) {
      // Remember who is still alive here for next time.
      s.room.pending = s.enemies.filter((e) => !e.spawned && e.type !== 'treasure').map((e) => e.type);
      if (s.tut) s.tut.rooms++;
    }
    const room = s.world.rooms[id];
    const firstVisit = !room.visited;
    room.visited = true;
    s.room = room;
    s.enemies = [];
    s.bullets = [];
    s.foes = [];
    s.shards = [];
    s.hazards = [];
    s.spawns = [];
    s.event = null;
    s.sealed = false;
    s.card = null;
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
    if (s.tut && id === s.world.start && s.run.loop === 0 && !room.cleared) {
      // Give first-time players a moment to read the tips.
      for (const e of s.enemies) e.sleep = 8;
    }
    const has = (type) => s.enemies.some((e) => e.type === type);
    if (room.boss && has('boss')) {
      s.card = { kicker: 'THE DEEPEST ROOM', title: 'The Core', sub: 'Three phases. Shatter it to win.', color: '#e879f9', t: 3.4 };
      Sound.roar();
    } else if (room.mini && has(room.mini)) {
      const t = ENEMIES[room.mini];
      s.card = { kicker: 'MINI-BOSS', title: t.title, sub: t.hint, color: t.color, t: 3 };
      Sound.roar();
    } else if (room.guardian && has('guardian')) {
      s.banner = { text: 'Guardian', sub: 'Shoot its shields away first', t: 2.5 };
    } else {
      s.banner = { text: `Depth ${room.d}`, sub: room.cleared ? 'Cleared' : `${s.enemies.length} enemies`, t: 1.6 };
    }
    // Room events happen once, on the first visit.
    if (room.event && !room.eventDone && !room.cleared) startEvent(room);
  }

  function spawnEnemy(type, awayFromPlayer, x, y) {
    const t = ENEMIES[type];
    const lvl = state.room.lvl;
    const scale = 1 + 0.35 * lvl;
    const isBoss = type === 'boss';
    if (x === undefined) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rand(0, Math.PI * 2);
        const r = isBoss ? 0 : t.mini ? rand(0, ARENA_R * 0.35) : rand(0, ARENA_R * 0.8);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        if (!awayFromPlayer || Math.hypot(x - state.player.x, y - state.player.y) > 320) break;
      }
    }
    const hp = t.hp * (isBoss ? 1 + 0.6 * state.run.loop : t.mini ? 1 + 0.3 * lvl : scale);
    const e = {
      type, x, y, vx: 0, vy: 0, hp, maxHp: hp,
      // The Core has its own damage scale; its bullet patterns are dangerous enough.
      r: t.r, dmg: isBoss ? 3.8 * (1 + 0.25 * state.run.loop) : t.mini ? 1 + 0.4 * lvl : 1 + 0.45 * lvl,
      cd: rand(0.8, 2), t: rand(0, 10), flash: 0, spin: rand(0, 6), state: 'idle', timer: rand(1, 2.5),
      born: 0, // spawn-in animation, 0 to 1
    };
    if (type === 'guardian') {
      e.shields = [0, 1, 2, 3].map((k) => ({ a: (k * Math.PI) / 2, hp: 60 * scale, max: 60 * scale }));
    } else if (isBoss) {
      Object.assign(e, { phase: 1, act: 'spiral', actT: 3, fireT: 0, beams: [], beamT: 0, beamDir: 1, shell: 1 });
    } else if (type === 'weaver') {
      Object.assign(e, { orbit: rand(0, 6), blinkT: 4, blink: 0, atk: 0, stream: null, cd: 1.5 });
    } else if (type === 'ram') {
      Object.assign(e, { timer: 1.6, dashes: 0, side: 1 });
    } else if (type === 'treasure') {
      e.life = 24;
      e.max = 24;
    }
    state.enemies.push(e);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Room events: shard storms, ambushes and runaway treasure
  // ---------------------------------------------------------------------------

  function startEvent(room) {
    room.eventDone = true;
    const s = state;
    if (room.event === 'storm') {
      s.event = { kind: 'storm', t: 15, next: 1.2 };
      s.card = { kicker: 'ROOM EVENT', title: 'Shard storm', sub: 'Crystals are falling. Dodge the rings, grab the shards.', color: '#67e8f9', t: 2.8 };
    } else if (room.event === 'ambush') {
      s.event = { kind: 'ambush', armed: true, wave: 0, waves: 3, delay: 0 };
      s.banner = { text: `Depth ${room.d}`, sub: 'Too quiet...', t: 2 };
    } else if (room.event === 'treasure') {
      spawnEnemy('treasure', true);
      s.card = { kicker: 'ROOM EVENT', title: 'Treasure crystal', sub: 'It runs. Shoot it before it escapes.', color: '#fde047', t: 2.8 };
      Sound.treasure();
    }
  }

  function updateEvent(dt) {
    const ev = state.event;
    if (!ev) return;
    const p = state.player;
    const lvl = state.room.lvl;
    if (ev.kind === 'storm') {
      ev.t -= dt;
      ev.next -= dt;
      if (ev.next <= 0 && ev.t > 0) {
        ev.next = rand(0.3, 0.6);
        let x;
        let y;
        if (Math.random() < 0.45) {
          // Some fall right around the player so the storm stays exciting.
          const a = rand(0, Math.PI * 2);
          const r = rand(30, 170);
          x = p.x + Math.cos(a) * r;
          y = p.y + Math.sin(a) * r;
        } else {
          const a = rand(0, Math.PI * 2);
          const r = Math.sqrt(Math.random()) * ARENA_R * 0.85;
          x = Math.cos(a) * r;
          y = Math.sin(a) * r;
        }
        const d = Math.hypot(x, y);
        if (d > ARENA_R - 50) {
          x *= (ARENA_R - 50) / d;
          y *= (ARENA_R - 50) / d;
        }
        state.hazards.push({ x, y, r: 50, t: 1.15, max: 1.15, dmg: 9 * (1 + 0.3 * lvl) });
        Sound.meteor();
      }
      if (ev.t <= 0 && !state.hazards.length) {
        state.event = null;
        state.banner = { text: 'The storm passes', sub: '', t: 1.6 };
      }
    } else if (ev.kind === 'ambush') {
      if (ev.armed) {
        if (Math.hypot(p.x, p.y) < 260 || !state.enemies.length) {
          ev.armed = false;
          ev.delay = 0.9;
          state.sealed = true;
          state.banner = null;
          state.card = { kicker: 'AMBUSH', title: 'The portals seal', sub: 'Survive three waves to break out.', color: '#f87171', t: 2.6 };
          addShake(8);
          state.chroma = Math.max(state.chroma, 0.5);
          Sound.seal();
        }
      } else if (!state.enemies.length && !state.spawns.length) {
        ev.delay -= dt;
        if (ev.delay <= 0) {
          if (ev.wave < ev.waves) {
            ev.wave++;
            spawnWave(ev.wave);
            ev.delay = 1.2;
            state.banner = { text: `Wave ${ev.wave} of ${ev.waves}`, sub: ev.wave === ev.waves ? 'Last one' : '', t: 1.5 };
          } else {
            state.sealed = false;
            state.event = null;
            dropShards(0, 0, Math.round(30 * (1 + 0.25 * lvl)), 320);
            flash(0, 0, 260, '#4ade80', 0.6);
            state.rings.push({ x: 0, y: 0, r: 30, life: 0.8, max: 0.8, color: '#4ade80', grow: 700 });
            state.card = { kicker: 'AMBUSH', title: 'Survived!', sub: 'The portals open. Grab the spoils.', color: '#4ade80', t: 2.4 };
            Sound.cleared();
          }
        }
      }
    }
  }

  // Ambush waves warp in around the rim.
  function spawnWave(n) {
    const lvl = state.room.lvl;
    const mix = ROOM_MIX.filter(([, from]) => lvl >= from);
    const count = Math.min(14, 3 + Math.ceil(lvl * 0.8) + n);
    const a0 = rand(0, Math.PI * 2);
    for (let k = 0; k < count; k++) {
      const a = a0 + (k / count) * Math.PI * 2;
      const r = ARENA_R * rand(0.62, 0.82);
      const type = pick(mix)[0];
      state.spawns.push({ type, x: Math.cos(a) * r, y: Math.sin(a) * r, t: 0.8 + k * 0.05, max: 0.8 + k * 0.05 });
    }
  }

  function updateSpawns(dt) {
    for (const sp of state.spawns) {
      sp.t -= dt;
      if (sp.t <= 0) {
        sp.done = true;
        const e = spawnEnemy(sp.type, false, sp.x, sp.y);
        e.spawned = true;
        burst(sp.x, sp.y, ENEMIES[sp.type].color, 10, 160);
        state.rings.push({ x: sp.x, y: sp.y, r: 6, life: 0.35, max: 0.35, color: ENEMIES[sp.type].color });
      }
    }
    state.spawns = state.spawns.filter((sp) => !sp.done);
  }

  // Falling crystals: a ring telegraphs where each lands.
  function updateHazards(dt) {
    const p = state.player;
    const f = form();
    for (const h of state.hazards) {
      h.t -= dt;
      if (h.t > 0) continue;
      h.done = true;
      state.rings.push({ x: h.x, y: h.y, r: 10, life: 0.4, max: 0.4, color: '#a5f3fc', grow: h.r * 3 });
      burst(h.x, h.y, '#67e8f9', settings.reduced ? 8 : 18, 280);
      flash(h.x, h.y, h.r * 2.4, '#22d3ee', 0.25);
      fragments(h.x, h.y, '#a5f3fc', 5, 4, 200);
      addShake(3);
      Sound.impact();
      if (Math.hypot(p.x - h.x, p.y - h.y) < h.r + f.r * 0.5) hurtPlayer(h.dmg, h.x, h.y);
      for (const e of state.enemies) {
        if (!e.dead && e.type !== 'treasure' && Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) damageEnemy(e, 40, e.x, e.y);
      }
      dropShards(h.x, h.y, 4 + Math.round(state.room.lvl * 0.6), 150);
    }
    state.hazards = state.hazards.filter((h) => !h.done);
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function toWorld(mx, my) {
    const c = state.cam;
    return { x: (mx - W / 2) / c.zoom + c.x, y: (my - H / 2) / c.zoom + c.y };
  }

  // Keyboard gives a unit direction; the touch stick gives an analogue one.
  function moveInput() {
    let ix = 0;
    let iy = 0;
    const k = input.keys;
    if (k.has('a') || k.has('arrowleft')) ix -= 1;
    if (k.has('d') || k.has('arrowright')) ix += 1;
    if (k.has('w') || k.has('arrowup')) iy -= 1;
    if (k.has('s') || k.has('arrowdown')) iy += 1;
    const len = Math.hypot(ix, iy);
    if (len) {
      ix /= len;
      iy /= len;
    }
    const m = input.touch.move;
    if (m) {
      const dx = m.x - m.ox;
      const dy = m.y - m.oy;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const amt = Math.min(1, d / (STICK_R * U));
        ix = (dx / d) * amt;
        iy = (dy / d) * amt;
      }
    }
    return [ix, iy];
  }

  // Touch aim assist: pull the aim toward an enemy inside a small cone.
  function assistAim(p, ang, f) {
    let best = null;
    let bestScore = 0.38;
    const spd = f.guns[0].spd;
    for (const e of state.enemies) {
      if (e.dead || e.inv) continue;
      const d = dist(e, p);
      if (d > 720) continue;
      const tt = d / spd;
      const a = Math.atan2(e.y + e.vy * tt - p.y, e.x + e.vx * tt - p.x);
      const score = Math.abs(angleDiff(ang, a)) + d / 4000;
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best === null ? ang : angleLerp(ang, best, 0.8);
  }

  function updatePlayer(dt) {
    const p = state.player;
    const f = form();
    let [ix, iy] = moveInput();
    if (AUTOPLAY) {
      // The bot always drives at full speed in the direction it picks.
      [ix, iy] = botMove(dt);
      const l = Math.hypot(ix, iy);
      if (l) {
        ix /= l;
        iy /= l;
      }
    }
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const tx = ix * f.speed;
    const ty = iy * f.speed;
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
    if (state.tut) state.tut.moved += Math.hypot(ix, iy) * f.speed * dt;

    // Aim: the bot, a touch stick, or the mouse.
    const ta = input.touch.aim;
    if (AUTOPLAY) {
      p.aim = Math.atan2(bot.aimPoint.y - p.y, bot.aimPoint.x - p.x);
    } else if (ta) {
      const dx = ta.x - ta.ox;
      const dy = ta.y - ta.oy;
      if (Math.hypot(dx, dy) > 6) ta.ang = Math.atan2(dy, dx);
      if (ta.ang !== undefined) p.aim = settings.assist ? assistAim(p, ta.ang, f) : ta.ang;
    } else if (!input.lastTouch) {
      const target = toWorld(input.mx, input.my);
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    }
    p.inv -= dt;
    p.flash -= dt;
    p.spin += dt * 0.6;
    p.gulp = Math.max(0, p.gulp - dt * 4);

    const firing = AUTOPLAY ? bot.fire : input.down || input.keys.has(' ') || !!ta;
    f.guns.forEach((g, i) => {
      if (p.cds[i] === undefined) p.cds[i] = g.delay || 0;
      p.cds[i] -= dt;
      p.kick[i] = Math.max(0, (p.kick[i] || 0) - dt * 8);
      if (firing && p.cds[i] <= 0) {
        p.cds[i] = g.rate;
        fireGun(p, g, f, i);
      }
    });

    // Portals (sealed during an ambush).
    state.portalCd -= dt;
    if (state.portalCd <= 0 && !state.sealed) {
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

  function fireGun(p, g, f, i) {
    const shots = g.ring ? g.ring : 1;
    const dmg = g.dmg * (modIs('glass') ? 1.4 : 1);
    for (let k = 0; k < shots; k++) {
      const base = g.ring ? p.aim + (k / shots) * Math.PI * 2 : p.aim + g.a;
      const a = base + (g.spread ? rand(-g.spread, g.spread) : 0);
      const ox = Math.cos(p.aim + Math.PI / 2) * g.off;
      const oy = Math.sin(p.aim + Math.PI / 2) * g.off;
      const muzzle = f.r + 4;
      state.bullets.push({
        x: p.x + ox + Math.cos(a) * muzzle, y: p.y + oy + Math.sin(a) * muzzle,
        vx: Math.cos(a) * g.spd, vy: Math.sin(a) * g.spd,
        dmg, r: g.size, life: 1.6, pierce: g.pierce || 1, hit: new Set(), color: f.color,
        explode: g.explode, home: g.home, split: g.split, bomblets: g.bomblets, spd: g.spd,
      });
    }
    // Muzzle flash, a kick in the barrel, and a spark or two.
    if (!g.ring) {
      const a = p.aim + g.a;
      const mx = p.x + Math.cos(p.aim + Math.PI / 2) * g.off + Math.cos(a) * (f.r + 10);
      const my = p.y + Math.sin(p.aim + Math.PI / 2) * g.off + Math.sin(a) * (f.r + 10);
      flash(mx, my, 10 + g.size * 2.6, f.color, 0.07);
      if (!settings.reduced && Math.random() < 0.5) {
        const sa = a + rand(-0.4, 0.4);
        const v = rand(150, 320);
        state.parts.push({ x: mx, y: my, vx: Math.cos(sa) * v, vy: Math.sin(sa) * v, life: 0.15, max: 0.2, color: '#ecfeff', size: 2 });
      }
    } else {
      state.rings.push({ x: p.x, y: p.y, r: f.r, life: 0.25, max: 0.25, color: f.color, grow: 300 });
    }
    p.kick[i] = 1;
    if (state.tut) state.tut.shots++;
    if (g.explode || (g.pierce && g.pierce > 1)) Sound.heavy();
    else Sound.shoot(1.15 - f.tier * 0.12);
    // Recoil nudges the tank backwards a little.
    p.vx -= Math.cos(p.aim) * g.dmg * 0.4;
    p.vy -= Math.sin(p.aim) * g.dmg * 0.4;
  }

  function hurtPlayer(dmg, fromX, fromY) {
    const p = state.player;
    if (p.inv > 0 || state.mode !== 'playing' || state.evo) return;
    if (modIs('glass')) dmg *= 1.25;
    p.inv = 0.6;
    p.flash = 0.15;
    p.mass -= dmg;
    state.hurtT = 1;
    addShake(5 + Math.min(10, dmg * 0.12));
    state.chroma = Math.max(state.chroma, 0.35);
    Sound.hurt();
    // Knock back, and spill some mass as shards that can be picked up again.
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx += Math.cos(a) * 260;
    p.vy += Math.sin(a) * 260;
    dropShards(p.x, p.y, Math.floor(dmg * 0.45), 220);
    if (p.mass <= 0) {
      p.mass = 0;
      // The tank itself shatters.
      const f = form();
      burst(p.x, p.y, f.color, 60, 420);
      fragments(p.x, p.y, f.color, 16, 6, 380);
      flash(p.x, p.y, 260, f.color, 0.6);
      state.rings.push({ x: p.x, y: p.y, r: 10, life: 0.9, max: 0.9, color: '#f87171', grow: 600 });
      addShake(14);
      state.hitstop = 0.15;
      Sound.bigShatter();
      endRun(false, 1.3);
      return;
    }
    const f = form();
    if (f.tier > 0 && p.mass < TIERS[f.tier]) {
      // Devolve: the outer shell cracks off.
      fragments(p.x, p.y, f.color, 12, 6, 300);
      flash(p.x, p.y, 180, '#f87171', 0.4);
      state.chroma = 0.8;
      p.form = f.parent;
      p.cds = [];
      p.kick = [];
      state.card = { kicker: 'DEVOLVED', title: FORMS[p.form].name, sub: 'Absorb shards to grow back.', color: '#f87171', t: 2 };
      Sound.devolve();
    }
  }

  function gainMass(v) {
    const p = state.player;
    if (modIs('rich')) v *= 1.5;
    p.mass = Math.min(MASS_CAP, p.mass + v);
    if (state.tut) state.tut.gained += v;
    state.gain = { v: (state.gain && state.gain.t > 0 ? state.gain.v : 0) + v, t: 0.9 };
    p.gulp = 1;
    const f = form();
    if (f.tier < 3 && p.mass >= TIERS[f.tier + 1] && f.next.length) {
      state.mode = 'choosing';
      input.down = false;
      if (AUTOPLAY) choose(pick(f.next));
    }
  }

  // Evolving: time slows, the old form breaks into light, the new one assembles.
  function choose(id) {
    const p = state.player;
    const old = p.form;
    p.form = id;
    p.cds = [];
    p.kick = [];
    state.mode = 'playing';
    state.stats.maxTier = Math.max(state.stats.maxTier, FORMS[id].tier);
    const f = FORMS[id];
    state.evo = { t: 0, dur: 2.4, from: old, to: id };
    p.inv = Math.max(p.inv, 1.2);
    fragments(p.x, p.y, FORMS[old].color, settings.reduced ? 8 : 18, 6, 340);
    burst(p.x, p.y, '#ecfeff', settings.reduced ? 20 : 50, 380);
    flash(p.x, p.y, 320, f.color, 0.8);
    state.rings.push({ x: p.x, y: p.y, r: 10, life: 0.9, max: 0.9, color: '#ecfeff', grow: 520 });
    state.chroma = 1;
    addShake(6);
    state.card = { kicker: `EVOLVED · TIER ${f.tier}`, title: f.name, sub: f.desc, color: f.color, t: 3.2 };
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
          if (e.inv) continue;
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
        else burst(b.x, b.y, b.color || '#a5f3fc', 3, 60);
        continue;
      }
      for (const e of state.enemies) {
        if (e.dead || e.inv || b.hit.has(e)) continue;
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
                fragments(sx, sy, '#fecaca', 4, 3, 220);
                flash(sx, sy, 60, '#ef4444', 0.25);
                Sound.shatter(1.3);
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
                dmg: b.dmg * 0.5, r: b.r * 0.7, life: 0.5, pierce: 1, hit: new Set([e]), spd: b.spd, color: b.color,
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
    burst(b.x, b.y, '#fb923c', settings.reduced ? 8 : 16, 260);
    flash(b.x, b.y, r * 1.6, '#fb923c', 0.18);
    addShake(3);
    Sound.boom();
    for (const e of state.enemies) {
      if (!e.dead && !e.inv && Math.hypot(e.x - b.x, e.y - b.y) < r + e.r) damageEnemy(e, b.dmg, e.x, e.y);
    }
    if (b.bomblets) {
      for (let k = 0; k < b.bomblets; k++) {
        const a = (k / b.bomblets) * Math.PI * 2 + rand(-0.2, 0.2);
        state.bullets.push({
          x: b.x, y: b.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, color: '#fdba74',
          dmg: b.dmg * 0.5, r: 4, life: 0.35, pierce: 1, hit: new Set(), explode: r * 0.55, spd: 260,
        });
      }
    }
  }

  function damageEnemy(e, dmg, hx, hy) {
    if (e.inv || e.dead) return;
    const t = ENEMIES[e.type];
    e.hp -= dmg;
    e.flash = 0.08;
    e.sleep = 0;
    if (e.type === 'boss' && !e.engaged) {
      // The final fight is on: the portals seal until it is won.
      // (Mini-boss rooms stay open, so an underpowered tank can retreat.)
      e.engaged = true;
      state.sealed = true;
      state.banner = { text: 'Sealed in', sub: 'Win the fight to open the portals', t: 1.8 };
      Sound.seal();
    }
    burst(hx, hy, t.color, 3, 90);
    Sound.hit();
    if (e.type === 'treasure') {
      // Every hit knocks loose a shard; the rest spill when it shatters.
      dropShards(hx, hy, 1 + Math.round(state.room.lvl * 0.15), 120);
    }
    if (e.type === 'boss') {
      if (e.phase === 1 && e.hp < e.maxHp * 0.66) {
        e.hp = e.maxHp * 0.66;
        bossPhase(e, 2);
        return;
      }
      if (e.phase === 2 && e.hp < e.maxHp * 0.33) {
        e.hp = e.maxHp * 0.33;
        bossPhase(e, 3);
        return;
      }
    }
    if (t.mini && !e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      flash(e.x, e.y, 200, t.color, 0.4);
      state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.6, max: 0.6, color: t.color, grow: 500 });
      addText(e.x, e.y - e.r - 26, 'Enraged!', t.color, 1.4);
      state.chroma = Math.max(state.chroma, 0.5);
      addShake(6);
      Sound.roar();
    }
    if (e.hp > 0) return;
    e.dead = true;
    state.stats.kills++;
    const big = e.type === 'boss' || e.type === 'guardian' || t.mini;
    const n = settings.reduced ? 6 + t.r * 0.4 : 14 + t.r;
    burst(e.x, e.y, t.color, n, big ? 420 : 260);
    fragments(e.x, e.y, t.color, big ? 14 : t.r >= 15 ? 6 : 3, t.sides, big ? 360 : 240);
    state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.3, max: 0.3, color: t.color });
    flash(e.x, e.y, e.r * (big ? 7 : 3.5), t.color, big ? 0.5 : 0.18);
    if (big) {
      // Big shatters: freeze a beat, shake, and split the colours.
      state.hitstop = Math.max(state.hitstop, 0.12);
      addShake(12);
      state.chroma = 1;
      for (let k = 0; k < 3; k++) state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.5 + k * 0.2, max: 0.5 + k * 0.2, color: k ? '#ecfeff' : t.color, grow: 380 + k * 200 });
      Sound.bigShatter();
    } else {
      if (t.r >= 15) {
        state.hitstop = Math.max(state.hitstop, 0.035);
        addShake(3);
      }
      Sound.shatter(t.r >= 15 ? 1.4 : 1);
    }
    if (e.type === 'boss') {
      bossDeath(e);
      return;
    }
    const lvl = state.room.lvl;
    if (e.type === 'treasure') {
      addText(e.x, e.y - 30, 'Treasure!', '#fde047', 1.6);
      Sound.treasure();
      dropShards(e.x, e.y, Math.round(t.drop * (1 + 0.25 * lvl)), 260);
      return;
    }
    dropShards(e.x, e.y, Math.round(t.drop * (1 + (t.mini ? 0.15 : 0.25) * lvl)), big ? 260 : 160);
    if (t.mini) state.card = { kicker: 'MINI-BOSS DEFEATED', title: t.title, sub: 'Its crystal heart is yours.', color: t.color, t: 2.6 };
    if (e.type === 'splitter') {
      for (let k = 0; k < 3; k++) {
        const m = spawnEnemy('mite', false, e.x + rand(-12, 12), e.y + rand(-12, 12));
        m.spawned = true;
        m.born = 1;
        m.vx = rand(-200, 200);
        m.vy = rand(-200, 200);
      }
    }
  }

  function enemyShot(e, a, spd, dmg, size = 5, extra) {
    const b = {
      x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg: dmg * e.dmg, r: size, life: 4, color: '#fb7185',
    };
    if (extra) Object.assign(b, extra);
    state.foes.push(b);
    return b;
  }

  // --- The Core: three phases, each with its own attack cycle -------------------

  function bossPhase(e, n) {
    const p = state.player;
    e.phase = n;
    e.inv = true;
    e.act = 'cine';
    e.actT = 1.6;
    e.beams = [];
    e.dash = null;
    state.cine = { t: 0, dur: 2.6, x: e.x, y: e.y };
    // Clear the air: every enemy bullet turns into a harmless spark.
    for (const b of state.foes) burst(b.x, b.y, '#f0abfc', 1, 80);
    state.foes = [];
    // A shockwave pushes the player back.
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    p.vx += Math.cos(a) * 600;
    p.vy += Math.sin(a) * 600;
    for (let k = 0; k < 3; k++) state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.7 + k * 0.25, max: 0.7 + k * 0.25, color: k === 1 ? '#ecfeff' : '#e879f9', grow: 700 + k * 250 });
    flash(e.x, e.y, 520, '#e879f9', 0.9);
    burst(e.x, e.y, '#f0abfc', settings.reduced ? 30 : 80, 520);
    if (n === 3) {
      // The crystal shell breaks away.
      e.shell = 0;
      fragments(e.x, e.y, '#e879f9', 18, 5, 420);
    }
    state.chroma = 1;
    state.hitstop = 0.18;
    addShake(16);
    state.card = n === 2
      ? { kicker: 'PHASE II', title: 'The Core awakens', sub: 'Beams sweep the arena. Run with them.', color: '#e879f9', t: 3 }
      : { kicker: 'PHASE III', title: 'The Core fractures', sub: 'It hunts you now. Sidestep the charges.', color: '#f43f5e', t: 3 };
    Sound.roar();
  }

  function bossDeath(e) {
    state.cine = { t: 0, dur: 3, x: e.x, y: e.y, death: true, pops: 0 };
    state.foes = [];
    for (let k = 0; k < 6; k++) burst(e.x + rand(-60, 60), e.y + rand(-60, 60), pick(['#e879f9', '#67e8f9', '#fde047']), settings.reduced ? 10 : 30, 420);
    state.hitstop = 0.25;
    state.card = { kicker: state.run.loop ? `LOOP ${state.run.loop + 1} CLEARED` : 'VICTORY', title: 'The Core is shattered', sub: '', color: '#fde047', t: 3 };
    endRun(true, 2.6);
  }

  function bossAI(e, dt, toP, d, steer) {
    const p = state.player;
    const t = ENEMIES.boss;
    e.actT -= dt;
    e.fireT -= dt;
    const next = (act, time) => {
      e.act = act;
      e.actT = time;
      e.fireT = 0;
    };
    if (e.act === 'cine') {
      if (e.actT <= 0) {
        e.inv = false;
        next(e.phase === 2 ? 'beams' : 'dash', e.phase === 2 ? 3.9 : 0);
        if (e.phase === 3) e.dashes = 2;
      }
      return;
    }
    const color = e.phase === 3 ? '#fb7185' : '#f0abfc';
    if (e.phase === 1) {
      steer(toP + (d > 280 ? 0 : Math.PI), t.speed);
      if (e.act === 'spiral') {
        if (e.fireT <= 0) {
          e.fireT = 0.13;
          for (let k = 0; k < 4; k++) enemyShot(e, e.spin * 1.7 + (k / 4) * Math.PI * 2, 200, 8, 6, { color });
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('fans', 1.5);
      } else if (e.act === 'fans') {
        if (e.fireT <= 0) {
          e.fireT = 0.5;
          for (const da of [-0.3, -0.15, 0, 0.15, 0.3]) enemyShot(e, toP + da, 310, 9, 6, { color });
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('ring', 1.1);
      } else {
        if (e.fireT <= 0 && e.actT > 0.5) {
          e.fireT = 9;
          for (let k = 0; k < 18; k++) enemyShot(e, e.spin + (k / 18) * Math.PI * 2, 190, 9, 7, { color });
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('spiral', 3);
      }
    } else if (e.phase === 2) {
      if (e.act === 'beams') {
        // Three beams: a flickering warning, then they burn and sweep.
        steer(0, 0);
        if (!e.beams.length) {
          e.beamDir = -e.beamDir || 1;
          const a0 = toP + Math.PI / 3;
          e.beams = [0, 1, 2].map((k) => ({ a: a0 + (k / 3) * Math.PI * 2 }));
          e.beamT = 0;
          Sound.charge();
        }
        const was = e.beamT;
        e.beamT += dt;
        const firing = e.beamT > 1.1;
        if (firing && was <= 1.1) Sound.zap();
        for (const bm of e.beams) bm.a += dt * e.beamDir * (firing ? 0.55 : 0.12);
        // Slow drifting shots between the beams keep the player honest.
        if (firing && e.fireT <= 0) {
          e.fireT = 0.35;
          for (const bm of e.beams) enemyShot(e, bm.a + Math.PI / 3, 150, 8, 6, { color });
        }
        if (firing) {
          const f = form();
          for (const bm of e.beams) {
            const rx = p.x - e.x;
            const ry = p.y - e.y;
            const along = rx * Math.cos(bm.a) + ry * Math.sin(bm.a);
            const across = -rx * Math.sin(bm.a) + ry * Math.cos(bm.a);
            if (along > 0 && Math.abs(across) < 14 + f.r) {
              // Knocked sideways, out of the beam.
              const side = Math.sign(across) || 1;
              hurtPlayer(12 * e.dmg, p.x + Math.sin(bm.a) * side * 40, p.y - Math.cos(bm.a) * side * 40);
            }
          }
          addShake(1.5);
        }
        if (e.actT <= 0) {
          e.beams = [];
          next('ring', 1.2);
        }
      } else if (e.act === 'ring') {
        steer(toP + Math.PI / 2, t.speed * 1.5);
        if (e.fireT <= 0 && e.actT > 0.6) {
          e.fireT = 9;
          for (let k = 0; k < 22; k++) enemyShot(e, e.spin * 1.5 + (k / 22) * Math.PI * 2, 210, 9, 7, { color });
          if (state.enemies.filter((x) => x.type === 'mite').length < 8) {
            for (let k = 0; k < 3; k++) {
              const m = spawnEnemy('mite', false, e.x + rand(-80, 80), e.y + rand(-80, 80));
              m.spawned = true;
            }
          }
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('fans', 1.6);
      } else {
        steer(toP + (d > 300 ? 0 : Math.PI), t.speed * 1.5);
        if (e.fireT <= 0) {
          e.fireT = 0.4;
          for (const da of [-0.36, -0.18, 0, 0.18, 0.36]) enemyShot(e, toP + da, 330, 9, 6, { color });
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('beams', 3.9);
      }
    } else {
      // Phase three: charges, a storm of spirals, and homing orbs.
      if (e.act === 'dash') {
        if (!e.dash) {
          e.dash = { state: 'wind', t: 0.75, a: toP };
          Sound.charge();
        }
        const ds = e.dash;
        ds.t -= dt;
        if (ds.state === 'wind') {
          steer(0, 0);
          ds.a = angleLerp(ds.a, toP, Math.min(1, dt * 2.5));
          if (ds.t <= 0) {
            ds.state = 'go';
            ds.t = 0.6;
            e.snappy = true;
          }
        } else {
          steer(ds.a, 640);
          if (ds.t <= 0 || e.atWall) {
            e.snappy = false;
            for (let k = 0; k < 24; k++) enemyShot(e, (k / 24) * Math.PI * 2 + e.spin, 230, 9, 7, { color });
            state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.5, max: 0.5, color: '#fb7185', grow: 500 });
            addShake(8);
            Sound.boom();
            e.dash = null;
            e.dashes--;
            if (e.dashes <= 0) next('storm', 2.6);
            else e.act = 'dash';
          }
        }
      } else if (e.act === 'storm') {
        steer(toP + Math.PI / 2, t.speed * 2);
        if (e.fireT <= 0) {
          e.fireT = 0.17;
          for (let k = 0; k < 5; k++) enemyShot(e, -e.spin * 2.2 + (k / 5) * Math.PI * 2, 220, 9, 6, { color });
          Sound.enemyShot();
        }
        if (e.actT <= 0) next('orbs', 1.4);
      } else {
        steer(toP + (d > 300 ? 0 : Math.PI), t.speed * 2);
        if (e.fireT <= 0 && e.actT > 0.4) {
          e.fireT = 0.3;
          enemyShot(e, toP + rand(-0.9, 0.9), 170, 12, 10, { color: '#fb923c', home: 2.6, life: 5 });
          Sound.enemyShot();
        }
        if (e.actT <= 0) {
          next('dash', 0);
          e.dashes = 2;
        }
      }
    }
  }

  // --- Mini-bosses -------------------------------------------------------------

  // The Weaver drifts in a slow circle, lays mines, fires web streams and blinks.
  function weaverAI(e, dt, toP, d, steer) {
    const t = ENEMIES.weaver;
    const p = state.player;
    e.orbit += dt * 0.35;
    const tx = Math.cos(e.orbit) * 220;
    const ty = Math.sin(e.orbit) * 220;
    steer(Math.atan2(ty - e.y, tx - e.x), t.speed * (e.enraged ? 1.4 : 1));
    e.blinkT -= dt;
    if (e.blink > 0) {
      e.blink -= dt;
      if (e.blink <= 0.3 && !e.moved) {
        // Reappear somewhere away from the player.
        for (let k = 0; k < 12; k++) {
          const a = rand(0, Math.PI * 2);
          const r = rand(80, ARENA_R * 0.6);
          e.x = Math.cos(a) * r;
          e.y = Math.sin(a) * r;
          if (Math.hypot(e.x - p.x, e.y - p.y) > 300) break;
        }
        e.vx = 0;
        e.vy = 0;
        e.moved = true;
        state.rings.push({ x: e.x, y: e.y, r: 90, life: 0.3, max: 0.3, color: t.color, grow: -250 });
      }
      if (e.blink <= 0) {
        e.inv = false;
        e.moved = false;
        burst(e.x, e.y, t.color, 16, 220);
      }
      return;
    }
    if (e.blinkT <= 0) {
      e.blink = 0.65;
      e.inv = true;
      e.blinkT = e.enraged ? 3.6 : 5.2;
      burst(e.x, e.y, t.color, 16, 220);
      Sound.blink();
      if (e.enraged && state.enemies.length < 10) {
        for (let k = 0; k < 2; k++) {
          const m = spawnEnemy('mite', false, e.x + rand(-40, 40), e.y + rand(-40, 40));
          m.spawned = true;
        }
      }
      return;
    }
    if (e.cd <= 0) {
      e.atk = (e.atk + 1) % 2;
      if (e.atk === 0) {
        const n = e.enraged ? 7 : 5;
        for (let k = 0; k < n; k++) {
          enemyShot(e, toP + (k - (n - 1) / 2) * 0.45, 280, 7, 7, { mine: rand(0.55, 0.8), fuse: 1.6, color: '#a3e635', life: 6 });
        }
        e.cd = e.enraged ? 1.7 : 2.3;
      } else {
        e.stream = { left: e.enraged ? 7 : 5, t: 0, a: toP };
        e.cd = e.enraged ? 1.6 : 2.1;
      }
      Sound.enemyShot();
    }
    if (e.stream) {
      e.stream.t -= dt;
      if (e.stream.t <= 0) {
        e.stream.t = 0.09;
        e.stream.a = angleLerp(e.stream.a, toP, 0.15);
        for (const da of [-0.4, 0, 0.4]) enemyShot(e, e.stream.a + da, 330, 6, 5, { color: '#d9f99d' });
        if (--e.stream.left <= 0) e.stream = null;
      }
    }
  }

  // The Ram winds up (telegraphed by a red line), then charges in a chain.
  function ramAI(e, dt, toP, d, steer) {
    const t = ENEMIES.ram;
    e.timer -= dt;
    if (e.state === 'idle') {
      steer(toP + (Math.PI / 2) * e.side + (d > 320 ? -0.6 * e.side : 0), t.speed);
      if (e.timer <= 0) {
        e.state = 'wind';
        e.timer = e.enraged ? 0.6 : 0.8;
        e.dashes = e.enraged ? 4 : 3;
        e.dashA = toP;
        Sound.charge();
      }
    } else if (e.state === 'wind') {
      steer(0, 0);
      e.dashA = angleLerp(e.dashA, toP, Math.min(1, dt * 3));
      if (e.timer <= 0) {
        e.state = 'dash';
        e.timer = 1;
        e.snappy = true;
        e.sideT = 0;
      }
    } else if (e.state === 'dash') {
      steer(e.dashA, 640);
      if (e.enraged) {
        e.sideT -= dt;
        if (e.sideT <= 0) {
          e.sideT = 0.12;
          enemyShot(e, e.dashA + Math.PI / 2, 180, 6, 5);
          enemyShot(e, e.dashA - Math.PI / 2, 180, 6, 5);
        }
      }
      if (e.atWall || e.timer <= 0) {
        e.snappy = false;
        if (e.atWall) {
          // Slamming the rim throws out shrapnel.
          const back = Math.atan2(-e.y, -e.x);
          for (let k = 0; k < 11; k++) enemyShot(e, back + (k - 5) * 0.2, rand(200, 280), 7, 6);
          state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.5, max: 0.5, color: t.color, grow: 420 });
          burst(e.x, e.y, t.color, 24, 300);
          addShake(9);
          Sound.boom();
        }
        e.dashes--;
        e.vx *= 0.2;
        e.vy *= 0.2;
        if (e.dashes > 0) {
          e.state = 'wind';
          e.timer = 0.38;
          e.dashA = toP;
        } else {
          e.state = 'idle';
          e.timer = e.enraged ? 1.5 : 2.2;
          e.side = -e.side;
        }
      }
    }
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
      e.born = Math.min(1, e.born + dt * 3);
      e.spin += dt * (e.type === 'spinner' ? 2 : e.type === 'boss' && e.phase === 3 ? 1.6 : 0.8);
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

      if (e.sleep > 0) {
        // Dozing during the first-play tutorial: drift until shot or time runs out.
        e.sleep -= dt;
        steer(e.t * 0.4 + e.spin, 25);
      } else if (e.type === 'mite' || e.type === 'splitter') {
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
      } else if (e.type === 'treasure') {
        // Flee, skating along the rim when cornered, and escape if too slow.
        e.life -= dt;
        const away = toP + Math.PI;
        const ed = Math.hypot(e.x, e.y);
        let a = away + Math.sin(e.t * 2.3) * 0.7;
        if (ed > ARENA_R - 110) {
          const tangent = Math.atan2(e.y, e.x) + (Math.PI / 2) * (Math.sin(e.t * 0.4) > 0 ? 1 : -1);
          a = angleLerp(a, tangent, 0.7);
        }
        steer(a, d < 380 ? t.speed : t.speed * 0.45);
        if (!settings.reduced && Math.random() < dt * 20) {
          state.parts.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: 0, vy: 0, life: 0.5, max: 0.5, color: '#fef08a', size: 2 });
        }
        if (e.life <= 0) {
          e.dead = true;
          burst(e.x, e.y, '#fde047', 20, 260);
          flash(e.x, e.y, 120, '#fde047', 0.3);
          addText(e.x, e.y - 24, 'It got away...', '#fef08a', 1.6);
          Sound.blink();
          continue;
        }
      } else if (e.type === 'guardian') {
        steer(d > 220 ? toP : toP + Math.PI / 2, t.speed);
        if (e.cd <= 0) {
          e.cd = 1.2;
          for (const da of [-0.2, 0, 0.2]) enemyShot(e, toP + da, 300, 10, 6);
          Sound.enemyShot();
        }
      } else if (e.type === 'weaver') {
        weaverAI(e, dt, toP, d, steer);
      } else if (e.type === 'ram') {
        ramAI(e, dt, toP, d, steer);
      } else if (e.type === 'boss') {
        bossAI(e, dt, toP, d, steer);
      }
      const blend = e.snappy ? 1 : Math.min(1, dt * 4);
      e.vx += (ax - e.vx) * blend;
      e.vy += (ay - e.vy) * blend;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const ed = Math.hypot(e.x, e.y);
      e.atWall = ed > ARENA_R - e.r;
      if (e.atWall) {
        e.x *= (ARENA_R - e.r) / ed;
        e.y *= (ARENA_R - e.r) / ed;
      }
      // Touching the player hurts both.
      if (d < e.r + f.r && t.touch && !e.inv && !(e.sleep > 0)) {
        hurtPlayer(t.touch * e.dmg, e.x, e.y);
        if (e.type !== 'boss' && e.type !== 'guardian' && !t.mini) {
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
          // Heavy things barely move; small ones get shoved aside.
          const wa = a.r / min;
          const push = min - d;
          a.x -= (dx / d) * push * (1 - wa);
          a.y -= (dy / d) * push * (1 - wa);
          b.x += (dx / d) * push * wa;
          b.y += (dy / d) * push * wa;
        }
      }
    }
    state.enemies = state.enemies.filter((e) => !e.dead);
  }

  function updateFoes(dt) {
    const p = state.player;
    const f = form();
    const spawned = [];
    for (const b of state.foes) {
      if (b.mine !== undefined) {
        // Mines glide to a stop, tick, then burst into a ring.
        if (b.mine > 0) {
          b.mine -= dt;
          b.vx *= 1 - Math.min(1, dt * 3);
          b.vy *= 1 - Math.min(1, dt * 3);
        } else {
          b.vx = 0;
          b.vy = 0;
          b.fuse -= dt;
          if (b.fuse <= 0) {
            b.dead = true;
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2 + b.x;
              spawned.push({ x: b.x, y: b.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, dmg: b.dmg * 0.8, r: 4.5, life: 3, color: '#bef264' });
            }
            burst(b.x, b.y, '#bef264', 8, 140);
            continue;
          }
        }
      } else if (b.home) {
        b.home -= dt;
        const a = angleLerp(Math.atan2(b.vy, b.vx), Math.atan2(p.y - b.y, p.x - b.x), Math.min(1, dt * 1.8));
        const spd = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * spd;
        b.vy = Math.sin(a) * spd;
        if (b.home <= 0) b.home = 0;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > ARENA_R) b.dead = true;
      else if (Math.hypot(b.x - p.x, b.y - p.y) < f.r + b.r) {
        b.dead = true;
        hurtPlayer(b.dmg, b.x, b.y);
      }
    }
    state.foes = state.foes.filter((b) => !b.dead).concat(spawned);
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
      s.pull = s.delay <= 0 && d < magnet;
      if (s.pull) {
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
        if (!settings.reduced) state.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.2, max: 0.2, color: '#ecfeff', size: 3 });
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
    updateHazards(dt);
    updateSpawns(dt);
    updateEvent(dt);
    updateShards(dt);
    const ambush = state.event && state.event.kind === 'ambush';
    if (!state.room.cleared && !state.enemies.length && !state.spawns.length && !ambush && state.mode === 'playing') {
      state.room.cleared = true;
      const left = remainingRooms();
      state.banner = { text: 'Room cleared', sub: left ? `${left} rooms left to clear` : 'The whole web is clear', t: 2 };
      flash(state.player.x, state.player.y, 200, '#4ade80', 0.3);
      Sound.cleared();
    }
    updateTutorial(dt);
  }

  function remainingRooms() {
    return state.world.rooms.filter((r) => !r.cleared).length;
  }

  // ---------------------------------------------------------------------------
  // Ending a run, scores, and Endless mode
  // ---------------------------------------------------------------------------

  function runScore() {
    const s = state.stats;
    const time = state.t;
    let score = s.kills * 10 + s.rooms * 40 + s.deepest * 150 + s.loops * 6000;
    if (state.won) score += 6000 + Math.max(0, Math.round(4000 - time * 4));
    return score;
  }

  function endRun(won, delay) {
    const s = state;
    if (s.mode === 'over') return;
    s.mode = 'over';
    s.won = won;
    if (won) s.stats.loops++;
    s.endT = delay;
    input.down = false;
    input.touch.move = null;
    input.touch.aim = null;
    const score = runScore();
    s.result = { score };
    if (!s.run.daily && s.run.loop === 0) {
      s.prevBest = loadBest();
      saveBest({ won, time: Math.round(s.t), depth: s.stats.deepest, kills: s.stats.kills, form: form().name });
    }
    if (s.stats.loops > 0) {
      const prev = loadJSON('nameless-tanks-endless', null);
      s.result.prevLoops = prev ? prev.loops : 0;
      if (!prev || prev.loops < s.stats.loops) saveJSON('nameless-tanks-endless', { loops: s.stats.loops, form: form().name });
    }
    if (s.run.daily) {
      s.result.prevDaily = loadDaily(s.run.date);
      s.result.newDaily = saveDaily(s.run.date, { score, won, loops: s.stats.loops, time: Math.round(s.t), form: form().name });
    }
    if (won) Sound.win();
    else Sound.lose();
    if (delay <= 0) showOverlay('over');
  }

  // After beating the Core: a fresh, deeper web, keeping your tank.
  function continueEndless() {
    const s = state;
    s.run.loop++;
    s.world = makeWorld((s.run.seed + s.run.loop * 7919) >>> 0, s.run.loop, s.run.mod);
    s.room = null;
    s.mode = 'playing';
    s.won = false;
    s.endT = 0;
    s.cine = null;
    enterRoom(s.world.start, null);
    s.card = { kicker: 'ENDLESS', title: `Loop ${s.run.loop + 1}`, sub: 'The web reforms, deeper and angrier.', color: '#fde047', t: 3 };
    Sound.roar();
    showOverlay(null);
  }

  // ---------------------------------------------------------------------------
  // Autoplay bot (for automated testing): keeps its distance from enemies,
  // dodges bullets, beams, mines and falling crystals, collects shards, then
  // heads for the nearest room it has not cleared.
  // ---------------------------------------------------------------------------

  const bot = { aimPoint: { x: 1, y: 0 }, fire: false, react: 0, target: null, wob: 0, strafe: 1, strafeT: 0 };

  function botPath() {
    if (state.sealed) return null;
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
    // Aim at what can be hurt; keep away from everything.
    const alive = state.enemies.filter((e) => !e.dead);
    const living = alive.filter((e) => !e.inv);
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
        if (b.mine !== undefined && d < 80) {
          mx += ((p.x - b.x) / d) * 1.2;
          my += ((p.y - b.y) / d) * 1.2;
        }
      }
    }
    for (const h of state.hazards) {
      const d = Math.hypot(h.x - p.x, h.y - p.y) || 1;
      if (d < h.r + f.r + 30 && h.t < 0.9) {
        mx += ((p.x - h.x) / d) * 2.5;
        my += ((p.y - h.y) / d) * 2.5;
      }
    }
    for (const e of state.enemies) {
      // Sidestep telegraphed charges and sweeping beams.
      const lines = [];
      if ((e.type === 'ram' || e.type === 'charger') && e.state === 'wind') lines.push(e.dashA);
      if (e.dash && e.dash.state === 'wind') lines.push(e.dash.a);
      if (e.beams) for (const bm of e.beams) lines.push(bm.a + e.beamDir * 0.25);
      for (const a of lines) {
        const rx = p.x - e.x;
        const ry = p.y - e.y;
        const along = rx * Math.cos(a) + ry * Math.sin(a);
        const across = -rx * Math.sin(a) + ry * Math.cos(a);
        if (along > -40 && Math.abs(across) < 110) {
          const side = Math.sign(across) || 1;
          mx += -Math.sin(a) * side * 2.2;
          my += Math.cos(a) * side * 2.2;
        }
      }
    }
    if (alive.length) {
      const e = alive.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
      const d = dist(e, p);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const want = e.type === 'boss' ? 330 : ENEMIES[e.type].mini ? 300 : e.type === 'treasure' ? 120 : 240;
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
      } else {
        mx -= p.x * 0.01;
        my -= p.y * 0.01;
      }
    }
    return [mx, my];
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n, power) {
    if (settings.reduced) n = Math.ceil(n * 0.5);
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.2, 1) * power;
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, color, size: rand(1.5, 3.5) });
    }
  }

  // Spinning polygon shards: the pieces of whatever just broke.
  function fragments(x, y, color, n, sides, power) {
    if (settings.reduced) n = Math.ceil(n * 0.5);
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.3, 1) * power;
      const life = rand(0.5, 1.1);
      state.frags.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, 6), vr: rand(-9, 9),
        size: rand(3, 8), life, max: life, color, sides: Math.max(3, Math.min(6, sides)),
      });
    }
  }

  // A soft bloom pulse.
  function flash(x, y, r, color, life) {
    state.flashes.push({ x, y, r, color, life, max: life });
  }

  function addShake(v) {
    if (settings.shake) state.shake = Math.max(state.shake, v);
  }

  function addText(x, y, text, color, life = 1) {
    state.texts.push({ x, y, text, color, life, max: life });
  }

  // Slow motion during evolutions and the Core's phase changes.
  function timeScale() {
    let k = 1;
    const evo = state.evo;
    if (evo) k = evo.t < 1.3 ? 0.15 : Math.min(1, 0.15 + (evo.t - 1.3) * 0.9);
    const cine = state.cine;
    if (cine && !cine.death) k = Math.min(k, cine.t < 1.2 ? 0.25 : Math.min(1, 0.25 + (cine.t - 1.2) * 0.6));
    return k;
  }

  // Advance the game by some real time: hit-stop, slow motion, fixed steps.
  function advance(real) {
    if (state.mode === 'playing') {
      if (state.hitstop > 0) {
        state.hitstop = Math.max(0, state.hitstop - real);
      } else {
        let left = real * timeScale();
        while (left > 1e-6 && state.mode === 'playing') {
          const dt = Math.min(1 / 60, left);
          step(dt);
          left -= dt;
        }
      }
    }
    if (state.mode !== 'paused' && state.mode !== 'tree') updateEffects(real);
  }

  function updateEffects(dt) {
    const s = state;
    for (const p of s.parts) {
      p.life -= dt;
      p.vx *= 1 - Math.min(1, dt * 2);
      p.vy *= 1 - Math.min(1, dt * 2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    s.parts = s.parts.filter((p) => p.life > 0);
    const cap = settings.reduced ? 400 : 1000;
    if (s.parts.length > cap) s.parts.splice(0, s.parts.length - cap);
    for (const f of s.frags) {
      f.life -= dt;
      f.vx *= 1 - Math.min(1, dt * 1.6);
      f.vy *= 1 - Math.min(1, dt * 1.6);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    s.frags = s.frags.filter((f) => f.life > 0);
    if (s.frags.length > 300) s.frags.splice(0, s.frags.length - 300);
    for (const r of s.rings) {
      r.life -= dt;
      r.r = Math.max(0, r.r + dt * (r.grow || 240));
    }
    s.rings = s.rings.filter((r) => r.life > 0);
    for (const f of s.flashes) f.life -= dt;
    s.flashes = s.flashes.filter((f) => f.life > 0);
    for (const t of s.texts) {
      t.life -= dt;
      t.y -= 20 * dt;
    }
    s.texts = s.texts.filter((t) => t.life > 0);
    if (s.banner) {
      s.banner.t -= dt;
      if (s.banner.t <= 0) s.banner = null;
    }
    if (s.card) {
      if (s.card.max === undefined) s.card.max = s.card.t;
      s.card.t -= dt;
      if (s.card.t <= 0) s.card = null;
    }
    if (s.gain) {
      s.gain.t -= dt;
      if (s.gain.t <= -0.6) s.gain = null;
    }
    s.shake = Math.max(0, s.shake - dt * 30);
    s.chroma = Math.max(0, s.chroma - dt * 2.2);
    s.hurtT = Math.max(0, s.hurtT - dt * 2.5);
    s.fade = Math.max(0, s.fade - dt * 1.5);
    s.beat = Math.max(0, s.beat - dt * 3);
    for (const e of s.enemies) e.shown = e.shown === undefined ? e.hp : e.shown + (e.hp - e.shown) * Math.min(1, dt * 3);

    if (s.evo) {
      s.evo.t += dt;
      // Rings ripple out as the new form locks together.
      for (const at of [0.35, 0.7, 1.05]) {
        if (s.evo.t >= at && s.evo.t - dt < at) {
          const p = s.player;
          s.rings.push({ x: p.x, y: p.y, r: form().r, life: 0.7, max: 0.7, color: form().color, grow: 380 });
        }
      }
      if (s.evo.t >= s.evo.dur) s.evo = null;
    }
    if (s.cine) {
      const c = s.cine;
      c.t += dt;
      if (c.death && c.t < 1.8) {
        // A chain of detonations as the Core comes apart.
        while (c.pops < Math.floor(c.t / 0.16)) {
          c.pops++;
          const x = c.x + rand(-90, 90);
          const y = c.y + rand(-90, 90);
          const col = pick(['#e879f9', '#67e8f9', '#fde047', '#ecfeff']);
          burst(x, y, col, 24, 380);
          flash(x, y, 160, col, 0.35);
          addShake(6);
          Sound.boom();
        }
      }
      if (c.t >= c.dur) s.cine = null;
    }
    if (s.mode === 'over' && s.endT > 0) {
      s.endT -= dt;
      if (s.endT <= 0) showOverlay('over');
    }
    // Heartbeat when mass is low.
    if (s.mode === 'playing' && s.player.mass < LOW_MASS) {
      s.beatT -= dt;
      if (s.beatT <= 0) {
        s.beatT = 0.45 + (s.player.mass / LOW_MASS) * 0.5;
        s.beat = 1;
        Sound.heartbeat();
      }
    }

    // Camera follows the player, zooms out as the tank grows, and leans in for
    // evolutions and the Core's cinematics.
    const p = s.player;
    const c = s.cam;
    let tx = p.x;
    let ty = p.y;
    // Small screens lean in a little so the tank is not a speck.
    let zoom = (1 - form().tier * 0.07) * (1 + (U - 1) * 0.5);
    if (s.mode === 'menu') {
      s.menuT = (s.menuT || 0) + dt;
      tx = Math.cos(s.menuT * 0.12) * 260;
      ty = Math.sin(s.menuT * 0.12) * 160;
      zoom = 0.85;
    }
    if (s.evo) zoom *= 1 + 0.25 * Math.sin(Math.PI * clamp(s.evo.t / s.evo.dur, 0, 1));
    if (s.cine) {
      const k = s.cine.death ? 1 : s.cine.t < s.cine.dur * 0.55 ? 0.65 : 0;
      tx += (s.cine.x - tx) * k;
      ty += (s.cine.y - ty) * k;
      zoom *= 1.08;
    }
    c.zoom += (zoom - c.zoom) * Math.min(1, dt * 3);
    c.x += (tx - c.x) * Math.min(1, dt * 6);
    c.y += (ty - c.y) * Math.min(1, dt * 6);
  }

  // ---------------------------------------------------------------------------
  // First-play tutorial: a few short tips, each waiting for the player to do it
  // ---------------------------------------------------------------------------

  const TUT = [
    { key: 'Move with WASD or the arrow keys.', touch: 'Drag on the left half of the screen to move.' },
    { key: 'Aim with the mouse. Hold click or Space to fire.', touch: 'Drag on the right half to aim. You fire while that thumb is down.' },
    { key: 'Shatter enemies, then drive over their shards. Mass is your health and your growth.' },
    { key: 'When a room is clear, drive into a glowing portal. The Core waits in the deepest room.' },
    { key: 'Press T (or tap ⌬, top right) to see your evolution tree. Good luck!', touch: 'Tap ⌬ (top right) to see your evolution tree. Good luck!' },
  ];

  function updateTutorial(dt) {
    const tut = state.tut;
    if (!tut) return;
    if (tut.wait > 0) {
      tut.wait -= dt;
      if (tut.wait <= 0) {
        tut.step++;
        tut.t = 0;
        tut.ok = false;
        if (tut.step >= TUT.length) finishTutorial();
      }
      return;
    }
    tut.t += dt;
    const done = [tut.moved > 150, tut.shots >= 12, tut.gained >= 8, tut.rooms >= 1, tut.t > 7 || tut.treeSeen][tut.step];
    if (done) {
      tut.wait = 0.7;
      tut.ok = true;
      Sound.ding();
    }
  }

  function finishTutorial() {
    if (state) state.tut = null;
    saveJSON('nameless-tanks-tutorial', true);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const glowCache = new Map();
  let U = 1; // HUD scale: grows on small screens so the text stays readable
  let chromaBuf = null;
  let hexPath = null;
  let renderScale = 1; // steps down on slow devices to keep the frame rate up
  let slowT = 0;

  function resize() {
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 3) * renderScale);
    const w = canvas.clientWidth || W;
    // Cap the backing store so very large screens stay smooth.
    const bw = Math.min(Math.round(w * dpr), 3840);
    canvas.width = bw;
    canvas.height = Math.round(bw * (H / W));
    U = clamp(820 / w, 1, 1.6);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();

  // A soft round glow sprite per colour, drawn once and reused.
  function glow(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color.startsWith('#') ? `${color}55` : color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55;
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
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

  function shadeHex(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v * amount), 0, 255);
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  }

  function portalPos(dir) {
    const a = DIRS[dir][2];
    return { x: Math.cos(a) * (ARENA_R - 8), y: Math.sin(a) * (ARENA_R - 8) };
  }

  function arenaColor() {
    const r = state.room;
    if (state.sealed) return '#f87171';
    if (r.boss) return '#e879f9';
    return dangerColor(r.d);
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);
    if (!state) return;
    const c = state.cam;
    const sh = settings.shake ? state.shake : 0;
    const shx = rand(-sh, sh);
    const shy = rand(-sh, sh);
    drawStars(c);

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);
    drawArena();
    drawPortals();
    drawHazards(true);
    drawSpawns();
    ctx.globalCompositeOperation = 'lighter';
    for (const sd of state.shards) drawShard(sd);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) drawBullet(b);
    for (const b of state.foes) drawFoe(b);
    drawHazards(false);
    for (const p of state.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const f of state.frags) {
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      polygon(f.x, f.y, f.size, f.sides, f.rot);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const r of state.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = clamp(r.life / r.max, 0, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!settings.reduced) {
      for (const f of state.flashes) {
        ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
        drawGlow(f.x, f.y, f.r, f.color);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const t of state.texts) {
      ctx.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    const g = state.gain;
    if (g && state.mode === 'playing') {
      const p = state.player;
      ctx.globalAlpha = clamp(1 + g.t / 0.6, 0, 1);
      ctx.fillStyle = '#a5f3fc';
      ctx.font = `bold ${13 + Math.min(9, g.v / 6)}px system-ui, sans-serif`;
      ctx.fillText(`+${Math.round(g.v)}`, p.x, p.y - form().r - 18);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawVignette();
    chromaPass(state.chroma);
    if (state.fade > 0) {
      ctx.fillStyle = `rgba(165, 243, 252, ${state.fade * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.mode !== 'menu') {
      drawHud();
      drawCard();
      if (state.mode === 'choosing') drawChoice();
      if (state.mode === 'tree') drawTree();
      drawTutorial();
      drawSticks();
    }
    drawCursor();
  }

  function drawStars(c) {
    const r = (seed) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    const tw = state.t + (state.menuT || 0);
    for (let k = 0; k < 140; k++) {
      const depthF = 0.15 + r(k + 1) * 0.35;
      let x = (r(k + 7) * 2400 - c.x * depthF) % 1400;
      let y = (r(k + 13) * 1600 - c.y * depthF) % 900;
      if (x < 0) x += 1400;
      if (y < 0) y += 900;
      const a = 0.2 + r(k + 3) * 0.5 + Math.sin(tw * (1 + r(k + 5) * 3) + k) * 0.12;
      ctx.fillStyle = k % 9 === 0 ? `rgba(240, 171, 252, ${a})` : `rgba(186, 230, 253, ${a})`;
      const size = k % 13 === 0 ? 2.2 : 1.5;
      ctx.fillRect(x - 200, y - 170, size, size);
    }
  }

  // The hex floor is one path, built once and stroked in a single call.
  function buildHexPath() {
    hexPath = new Path2D();
    const size = 38;
    const hw = size * Math.sqrt(3);
    for (let row = -18; row <= 18; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = col * hw + (row % 2 ? hw / 2 : 0);
        const y = row * size * 1.5;
        if (Math.hypot(x, y) > ARENA_R + size) continue;
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
          if (i) hexPath.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
          else hexPath.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
        }
      }
    }
  }

  function drawArena() {
    const col = arenaColor();
    // Floor.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ARENA_R);
    g.addColorStop(0, state.room.boss ? '#1a0e2a' : '#0e1a2e');
    g.addColorStop(0.85, '#0b1424');
    g.addColorStop(1, state.room.boss ? '#2a1236' : '#10223a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.fill();
    // Hex grid, clipped to the arena, with a slow pulse running outward.
    if (!hexPath) buildHexPath();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.lineWidth = 1;
    ctx.stroke(hexPath);
    if (!settings.reduced) {
      // A faint pulse ring running out across the floor.
      const wave = (state.t * 160) % (ARENA_R + 200);
      ctx.strokeStyle = state.sealed ? 'rgba(248, 113, 113, 0.12)' : 'rgba(103, 232, 249, 0.06)';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(0, 0, wave, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Rim, tinted by danger.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.globalAlpha = state.sealed ? 0.5 + 0.3 * Math.sin(state.t * 8) : 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([18, 30]);
    ctx.lineDashOffset = -state.t * 30;
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R - 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPortals() {
    const rooms = state.world.rooms;
    for (const [dir, id] of Object.entries(state.room.links)) {
      const pp = portalPos(dir);
      const next = rooms[id];
      const sealed = state.sealed;
      const color = sealed ? '#f87171' : next.boss ? '#f472b6' : next.cleared ? '#4ade80' : next.visited ? '#fde047' : '#67e8f9';
      const pulse = 1 + Math.sin(state.t * 4) * 0.08;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pp.x, pp.y, PORTAL_R * 2.6, color);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, PORTAL_R * pulse, 0, Math.PI * 2);
      ctx.stroke();
      // Swirling arcs inside.
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const a = state.t * (2 + k * 0.7) + k * 2;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, PORTAL_R * (0.35 + k * 0.18) * pulse, a, a + Math.PI * 1.1);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (sealed) {
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pp.x - 14, pp.y - 14);
        ctx.lineTo(pp.x + 14, pp.y + 14);
        ctx.moveTo(pp.x + 14, pp.y - 14);
        ctx.lineTo(pp.x - 14, pp.y + 14);
        ctx.stroke();
      }
      // Label, pulled inside the arena so it stays readable.
      const a = DIRS[dir][2];
      const lx = Math.cos(a) * (ARENA_R - 72);
      const ly = Math.sin(a) * (ARENA_R - 72);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      let label = next.cleared ? 'Cleared' : `Depth ${next.d}`;
      if (next.boss) label = 'THE CORE';
      else if (next.mini && !next.cleared) label = `Depth ${next.d} · mini-boss`;
      if (sealed) label = 'SEALED';
      ctx.fillText(label, lx, ly + 4);
    }
  }

  function drawShard(s) {
    if (s.life < 4 && Math.floor(s.life * 6) % 2) return;
    const size = 3 + s.v * 0.9;
    // Vacuum trail while the tank pulls it in.
    const sp = Math.hypot(s.vx, s.vy);
    if (s.pull && sp > 60 && !settings.reduced) {
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
      ctx.lineWidth = size * 0.8;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.07, s.y - s.vy * 0.07);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    drawGlow(s.x, s.y, size * 3.2, '#22d3ee');
    ctx.fillStyle = '#a5f3fc';
    polygon(s.x, s.y, size, 4, s.spin);
    ctx.fill();
  }

  function drawBullet(b) {
    const col = b.color || '#22d3ee';
    drawGlow(b.x, b.y, b.r * 3.5, col);
    // A short streak along the velocity reads as speed.
    ctx.strokeStyle = col;
    ctx.lineWidth = b.r * 1.3;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#ecfeff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFoe(b) {
    const col = b.color || '#fb7185';
    if (b.mine !== undefined) {
      const ticking = b.mine <= 0;
      const blink = ticking && Math.floor(b.fuse * 10) % 2 === 0;
      drawGlow(b.x, b.y, b.r * (ticking ? 5 : 3.5), col);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      polygon(b.x, b.y, b.r * 1.7, 6, state.t * 3);
      ctx.stroke();
      ctx.fillStyle = blink ? '#ffffff' : col;
    } else {
      drawGlow(b.x, b.y, b.r * (b.home !== undefined ? 5 : 3.5), col);
      ctx.fillStyle = col;
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Falling crystals: a ground ring first (ground pass), then the crystal itself.
  function drawHazards(ground) {
    for (const h of state.hazards) {
      const k = clamp(h.t / h.max, 0, 1);
      if (ground) {
        ctx.fillStyle = `rgba(103, 232, 249, ${0.05 + (1 - k) * 0.18})`;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(165, 243, 252, ${0.4 + (1 - k) * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const y = h.y - k * 420;
        ctx.strokeStyle = 'rgba(165, 243, 252, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(h.x, y - 60);
        ctx.lineTo(h.x, y);
        ctx.stroke();
        drawGlow(h.x, y, 30, '#22d3ee');
        ctx.fillStyle = '#ecfeff';
        polygon(h.x, y, 9, 4, Math.PI / 4 + state.t * 4);
        ctx.fill();
      }
    }
  }

  function drawSpawns() {
    for (const sp of state.spawns) {
      const k = clamp(sp.t / sp.max, 0, 1);
      const col = ENEMIES[sp.type].color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k;
      drawGlow(sp.x, sp.y, 40, col);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8 + k * 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // A line that shows where something is about to charge.
  function dashLine(x, y, a, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -state.t * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 900, y + Math.sin(a) * 900);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawEnemy(e) {
    const t = ENEMIES[e.type];
    const color = e.flash > 0 ? '#ffffff' : t.color;
    const R = e.r * (0.3 + 0.7 * ease(e.born));
    ctx.save();
    if (e.type === 'weaver' && e.blink > 0) ctx.globalAlpha = clamp(Math.abs(e.blink - 0.3) / 0.35, 0.05, 1);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(e.x, e.y, R * (t.mini || e.type === 'boss' ? 3.2 : 2.6), t.color);
    ctx.globalCompositeOperation = 'source-over';

    if (e.type === 'charger' && e.state === 'wind') dashLine(e.x, e.y, e.dashA, 'rgba(250, 204, 21, 0.6)', 2);
    if (e.type === 'ram' && e.state === 'wind') dashLine(e.x, e.y, e.dashA, `rgba(248, 113, 113, ${0.5 + 0.4 * Math.sin(state.t * 30)})`, 6);
    if (e.type === 'boss') {
      drawBoss(e, color);
      ctx.restore();
      return;
    }

    const rot = e.type === 'charger' ? Math.atan2(e.vy, e.vx)
      : e.type === 'ram' ? (e.state === 'idle' ? Math.atan2(e.vy, e.vx) : e.dashA) : e.spin;
    ctx.fillStyle = shadeHex(t.color, 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (e.type === 'weaver') {
      // Six jointed legs that scuttle.
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 6; k++) {
        const a = e.spin * 0.5 + (k / 6) * Math.PI * 2;
        const wig = Math.sin(e.t * 6 + k * 1.7) * 0.25;
        const kx = e.x + Math.cos(a + wig) * R * 1.4;
        const ky = e.y + Math.sin(a + wig) * R * 1.4;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * R * 0.8, e.y + Math.sin(a) * R * 0.8);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(a - wig) * R * 0.6, ky + Math.sin(a - wig) * R * 0.6);
        ctx.stroke();
      }
    }
    polygon(e.x, e.y, R, t.sides, rot);
    ctx.fill();
    ctx.stroke();
    // Inner facet.
    ctx.strokeStyle = shadeHex(t.color, 0.8);
    ctx.lineWidth = 1.2;
    polygon(e.x, e.y, R * 0.5, t.sides, -rot);
    ctx.stroke();
    if (e.type === 'spiker') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = rot + (k / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * R * 0.8, e.y + Math.sin(a) * R * 0.8);
        ctx.lineTo(e.x + Math.cos(a) * R * 1.5, e.y + Math.sin(a) * R * 1.5);
        ctx.stroke();
      }
    } else if (e.type === 'treasure') {
      // A twinkle, and an arc that runs down until it escapes.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2;
      const tw = 1 + 0.4 * Math.sin(state.t * 9);
      ctx.beginPath();
      ctx.moveTo(e.x - R * 1.7 * tw, e.y);
      ctx.lineTo(e.x + R * 1.7 * tw, e.y);
      ctx.moveTo(e.x, e.y - R * 1.7 * tw);
      ctx.lineTo(e.x, e.y + R * 1.7 * tw);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R + 9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * e.life) / e.max);
      ctx.stroke();
    } else if (e.type === 'ram') {
      // Horn ridges along the leading edges.
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(rot) * R, e.y + Math.sin(rot) * R);
        ctx.lineTo(e.x + Math.cos(rot + side * 2.4) * R * 1.25, e.y + Math.sin(rot + side * 2.4) * R * 1.25);
        ctx.stroke();
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
    if (e.sleep > 0) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('z', e.x + 10, e.y - e.r - 4 - (state.t * 8) % 6);
      ctx.fillText('z', e.x + 16, e.y - e.r - 12 - (state.t * 8) % 6);
    }
    if (e.hp < e.maxHp && !t.mini) {
      const w = Math.max(24, e.r * 2);
      const y = e.y - e.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, y, w, 4);
      ctx.fillStyle = t.color;
      ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
    ctx.restore();
  }

  function drawBoss(e, color) {
    const t = state.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    // Beams: a flickering warning, then a burning sweep.
    for (const bm of e.beams || []) {
      const firing = e.beamT > 1.1;
      const ex = e.x + Math.cos(bm.a) * ARENA_R * 2;
      const ey = e.y + Math.sin(bm.a) * ARENA_R * 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      if (!firing) {
        ctx.strokeStyle = `rgba(240, 171, 252, ${0.25 + 0.25 * Math.sin(t * 40)})`;
        ctx.lineWidth = 2 + e.beamT * 3;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else {
        for (const [w, c] of [[34, 'rgba(232, 121, 249, 0.18)'], [14, 'rgba(245, 208, 254, 0.6)'], [4, '#ffffff']]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w + Math.sin(t * 50) * (w / 8);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.dash && e.dash.state === 'wind') dashLine(e.x, e.y, e.dash.a, `rgba(251, 113, 133, ${0.5 + 0.4 * Math.sin(t * 30)})`, 8);
    ctx.fillStyle = shadeHex('#e879f9', 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (e.shell) {
      // A cluster of crystals around the core; in phase two they spread and spin.
      const spread = e.phase === 2 ? 0.8 + 0.08 * Math.sin(t * 3) : 0.6;
      const spinK = e.phase === 2 ? 1.2 : 0.5;
      for (let k = 0; k < 7; k++) {
        const a = e.spin * spinK + (k / 7) * Math.PI * 2;
        polygon(e.x + Math.cos(a) * e.r * spread, e.y + Math.sin(a) * e.r * spread, e.r * 0.5, 5, a);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Fractured: jagged spikes around an exposed, overheating core.
      ctx.fillStyle = shadeHex('#fb7185', 0.4);
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = -e.spin + (k / 14) * Math.PI * 2;
        const rr = e.r * (k % 2 ? 0.55 : 0.95 + 0.08 * Math.sin(t * 9 + k));
        if (k) ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
        else ctx.moveTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.flash > 0 ? '#fff' : '#fb7185';
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(e.x, e.y, e.r * (1.2 + pulse * 0.5), e.phase === 3 ? '#f43f5e' : '#f0abfc');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = e.flash > 0 ? '#fff' : `rgba(253, 244, 255, ${0.6 + pulse * 0.4})`;
    ctx.strokeStyle = color;
    polygon(e.x, e.y, e.r * (e.phase === 3 ? 0.42 : 0.45), 7, -e.spin);
    ctx.fill();
    ctx.stroke();
    if (e.phase >= 2) {
      // Cracks of light across the core.
      ctx.strokeStyle = e.phase === 3 ? '#f43f5e' : '#c026d3';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3 + e.phase; k++) {
        const a = k * 2.1 + e.spin * 0.3;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * e.r * 0.25, e.y + Math.sin(a) * e.r * 0.25);
        ctx.lineTo(e.x + Math.cos(a + 0.3) * e.r * 0.42, e.y + Math.sin(a + 0.3) * e.r * 0.42);
        ctx.stroke();
      }
    }
    if (e.inv) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + 0.4 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.15, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The tank: guns, a ring of hexagonal cells that grows with mass, and a core.
  // o.assemble (0 to 1) flies the cells in from outside while a form evolves.
  function drawTank(x, y, formId, mass, aim, spin, flash, alpha = 1, o = {}) {
    const f = FORMS[formId];
    const asm = o.assemble === undefined ? 1 : o.assemble;
    const col = f.color;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (o.scale && o.scale !== 1) {
      ctx.translate(x, y);
      ctx.scale(o.scale, o.scale);
      ctx.translate(-x, -y);
    }
    // Guns, kicked back a little when they fire.
    const gunK = clamp((asm - 0.45) / 0.55, 0, 1);
    if (gunK > 0) {
      f.guns.forEach((g, i) => {
        if (g.ring) return;
        const a = aim + g.a;
        const ox = Math.cos(aim + Math.PI / 2) * g.off;
        const oy = Math.sin(aim + Math.PI / 2) * g.off;
        const kick = o.kick ? (o.kick[i] || 0) * 4 : 0;
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(a);
        const len = (f.r + 6 + (g.pierce ? 8 : 0) + (g.explode ? 2 : 0)) * gunK - kick;
        const w = g.size * 1.6;
        ctx.fillStyle = flash ? '#fff' : shadeHex(col, 0.45);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(0, -w / 2, Math.max(1, len), w, 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }
    // Final forms wear a slowly turning halo.
    if (f.tier === 3 && asm > 0.6) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * 0.45 * asm;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = -spin * 30;
      ctx.beginPath();
      ctx.arc(x, y, f.r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = alpha;
    }
    // Cells.
    const cells = clamp(Math.round(4 + mass / 14), 4, 34);
    const ring1 = Math.min(cells, 8);
    const ring2 = cells - ring1;
    const cellR = f.r * 0.24;
    const fly = 1 + (1 - asm) * 2.6;
    const twist = (1 - asm) * 4;
    const drawRing = (n, rr, offset) => {
      for (let i = 0; i < n; i++) {
        const a = spin * (offset ? -1 : 1) + offset + twist + (i / n) * Math.PI * 2;
        const cx = x + Math.cos(a) * rr * fly;
        const cy = y + Math.sin(a) * rr * fly;
        ctx.fillStyle = flash ? '#fff' : 'rgba(34, 211, 238, 0.35)';
        polygon(cx, cy, cellR, 6, a);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    };
    ctx.globalAlpha = alpha * clamp(asm * 1.5, 0, 1);
    drawRing(ring1, f.r * 0.72, 0);
    if (ring2) drawRing(ring2, f.r * 1.02, Math.PI / ring2);
    ctx.globalAlpha = alpha;
    // Core.
    const coreK = ease(asm);
    if (coreK > 0.02) {
      ctx.fillStyle = flash ? '#fff' : shadeHex(col, 0.45);
      polygon(x, y, f.r * 0.5 * coreK, 6, spin * 0.5);
      ctx.fill();
      ctx.strokeStyle = '#ecfeff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ecfeff';
      polygon(x, y, f.r * 0.2 * coreK, 6, -spin);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const f = form();
    if (state.mode === 'over' && !state.won) return; // shattered
    const evo = state.evo;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(p.x, p.y, f.r * (3 + p.gulp * 0.6), f.color);
    if (evo && evo.t < 1.8 && !settings.reduced) {
      // Rays of light while the new form assembles.
      const k = evo.t < 0.3 ? evo.t / 0.3 : clamp((1.8 - evo.t) / 1.2, 0, 1);
      ctx.fillStyle = f.color;
      for (let i = 0; i < 12; i++) {
        const a = state.t * 0.6 + (i / 12) * Math.PI * 2;
        ctx.globalAlpha = 0.18 * k;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a - 0.06) * 260, p.y + Math.sin(a - 0.06) * 260);
        ctx.lineTo(p.x + Math.cos(a + 0.06) * 260, p.y + Math.sin(a + 0.06) * 260);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    if (evo && evo.t < 0.5) {
      // The old form swells and breaks into light.
      drawTank(p.x, p.y, evo.from, p.mass, p.aim, p.spin, true, 1 - evo.t / 0.5, { scale: 1 + evo.t * 1.6 });
    }
    const blink = p.inv > 0 && !evo && Math.floor(p.inv * 20) % 2;
    const asm = evo ? ease((evo.t - 0.2) / 1.1) : 1;
    drawTank(p.x, p.y, p.form, p.mass, p.aim, p.spin, p.flash > 0, blink ? 0.4 : 1, { kick: p.kick, assemble: asm, scale: 1 + p.gulp * 0.05 });
  }

  // Red edges when hurt, and a pulsing red heartbeat when mass is low.
  function drawVignette() {
    const p = state.player;
    const playing = state.mode === 'playing' || state.mode === 'choosing';
    const low = playing ? clamp((LOW_MASS - p.mass) / LOW_MASS, 0, 1) : 0;
    const a = Math.max(state.hurtT * 0.4, low > 0 ? 0.18 + low * 0.3 + 0.3 * state.beat : 0);
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(220, 38, 38, 0)');
    g.addColorStop(1, `rgba(220, 38, 38, ${clamp(a, 0, 0.8)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Chromatic split: red and cyan copies of the frame, nudged apart and added.
  function chromaPass(amount) {
    if (settings.reduced || amount < 0.05) return;
    if (!chromaBuf) chromaBuf = document.createElement('canvas');
    if (chromaBuf.width !== canvas.width || chromaBuf.height !== canvas.height) {
      chromaBuf.width = canvas.width;
      chromaBuf.height = canvas.height;
    }
    const b = chromaBuf.getContext('2d');
    const off = amount * 5 * (canvas.width / W);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [col, dx] of [['#ff2050', off], ['#20e0ff', -off]]) {
      b.globalCompositeOperation = 'copy';
      b.drawImage(canvas, 0, 0);
      b.globalCompositeOperation = 'multiply';
      b.fillStyle = col;
      b.fillRect(0, 0, chromaBuf.width, chromaBuf.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * amount;
      ctx.drawImage(chromaBuf, dx, dx * 0.3);
    }
    ctx.restore();
  }

  // --- HUD ------------------------------------------------------------------------

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    const size = 36 * U;
    const gap = 6 * U;
    const list = [
      { id: 'tree', label: '⌬' },
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ];
    return list.map((b, k) => ({ ...b, x: W - 12 * U - size - (list.length - 1 - k) * (size + gap), y: 10 * U, w: size, h: size }));
  }

  function choiceCards() {
    const next = form().next;
    return next.map((id, k) => ({ id: `choose:${id}`, form: id, x: W / 2 - 255 + k * 270, y: 128, w: 240, h: 300 }));
  }

  const CHOICE_TREE = { id: 'tree', x: W / 2 - 90, y: 452, w: 180, h: 34 };

  // Radial evolution tree: the Seed in the middle, each tier one ring further out.
  const TREE = { x: 290, y: 300 };
  const TREE_POS = (() => {
    const place = {
      seed: [0, 0], twin: [180, 84], lancer: [0, 84],
      spread: [140, 162], swarm: [220, 162], rail: [320, 162], mortar: [40, 162],
      nova: [140, 234], hive: [220, 234], prism: [320, 234], cluster: [40, 234],
    };
    const out = {};
    for (const [id, [deg, r]] of Object.entries(place)) {
      const a = (deg * Math.PI) / 180;
      out[id] = { x: TREE.x + Math.cos(a) * r, y: TREE.y + Math.sin(a) * r };
    }
    return out;
  })();
  const TREE_CLOSE = { id: 'tree-close', x: W - 168, y: 500, w: 140, h: 34 };

  function treeNodes() {
    return Object.keys(FORMS).map((id) => {
      const p = TREE_POS[id];
      const r = 24 + FORMS[id].tier * 3;
      return { id: `node:${id}`, form: id, cx: p.x, cy: p.y, r, x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
    });
  }

  function tutBox() {
    const w = Math.min(W - 40, 540 * U);
    const h = 58 * U;
    const box = { x: W / 2 - w / 2, y: H - h - 14 * U, w, h };
    const skip = { id: 'tutskip', x: box.x + w - 70 * U, y: box.y + h / 2 - 14 * U, w: 60 * U, h: 28 * U };
    return { box, skip };
  }

  function hitTest(x, y) {
    if (!state || state.mode === 'menu') return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (state.mode === 'choosing') {
      for (const c of choiceCards()) if (inside(c, x, y)) return c;
      if (inside(CHOICE_TREE, x, y)) return CHOICE_TREE;
    }
    if (state.mode === 'tree') {
      if (inside(TREE_CLOSE, x, y)) return TREE_CLOSE;
      for (const n of treeNodes()) if (Math.hypot(x - n.cx, y - n.cy) < n.r + 6) return n;
    }
    if (state.tut && state.mode === 'playing') {
      const { skip } = tutBox();
      if (inside(skip, x, y)) return skip;
    }
    return null;
  }

  function panel(x, y, w, h, r = 10) {
    ctx.fillStyle = 'rgba(8, 15, 30, 0.78)';
    roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHud() {
    const p = state.player;
    const f = form();
    const hover = hitTest(input.mx, input.my);

    ctx.save();
    ctx.scale(U, U);
    // Form and mass.
    panel(12, 10, 300, 58);
    ctx.textAlign = 'left';
    ctx.fillStyle = f.color;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(f.name, 24, 32);
    const nameW = ctx.measureText(f.name).width;
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k <= f.tier ? f.color : 'rgba(255,255,255,0.15)';
      polygon(24 + nameW + 14 + k * 13, 27, 4.5, 6, 0);
      ctx.fill();
    }
    const lo = TIERS[f.tier];
    const hi = f.tier < 3 ? TIERS[f.tier + 1] : MASS_CAP;
    const frac = clamp((p.mass - lo) / (hi - lo), 0, 1);
    const low = p.mass < LOW_MASS;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(24, 42, 276, 12, 6);
    ctx.fill();
    const danger = low || (p.mass - lo < (hi - lo) * 0.15 && f.tier > 0);
    ctx.fillStyle = danger ? `rgba(248, 113, 113, ${0.75 + 0.25 * state.beat})` : f.color;
    roundRect(24, 42, Math.max(12, 276 * frac), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ecfeff';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.tier < 3 ? `Mass ${Math.floor(p.mass)} · evolve at ${hi}` : `Mass ${Math.floor(p.mass)} · final form`, 162, 51.5);

    // Room info, and the run's mode.
    const tag = state.run.daily ? 'DAILY' : state.run.loop ? `LOOP ${state.run.loop + 1}` : '';
    panel(12, 74, 230, 26, 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(state.room.boss ? 'The Core' : `Depth ${state.room.d} · ${state.enemies.length + state.spawns.length} enemies`, 22, 91);
    if (tag) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fde047';
      ctx.fillText(tag, 232, 91);
    }
    // Live room event.
    const ev = state.event;
    let evText = '';
    if (ev && ev.kind === 'storm') evText = `Shard storm · ${Math.max(0, Math.ceil(ev.t))}s`;
    else if (ev && ev.kind === 'ambush' && !ev.armed) evText = `Ambush · wave ${Math.max(1, ev.wave)} of ${ev.waves}`;
    const tr = state.enemies.find((e) => e.type === 'treasure');
    if (tr) evText = `Treasure escapes in ${Math.ceil(tr.life)}s`;
    if (evText) {
      panel(12, 106, 230, 24, 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = tr ? '#fde047' : ev && ev.kind === 'ambush' ? '#fca5a5' : '#a5f3fc';
      ctx.fillText(evText, 22, 122);
    }
    ctx.restore();

    drawMinimap();

    for (const b of sysButtons()) {
      const hot = hover && hover.id === b.id;
      ctx.fillStyle = hot ? 'rgba(165,243,252,0.3)' : 'rgba(8, 15, 30, 0.78)';
      roundRect(b.x, b.y, b.w, b.h, 8 * U);
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.font = `bold ${15 * U}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    drawBossBar();

    if (state.banner && state.mode !== 'choosing') {
      const bn = state.banner;
      ctx.save();
      ctx.translate(W / 2, 150);
      ctx.scale(U, U);
      ctx.globalAlpha = clamp(bn.t, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ecfeff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(bn.text, 0, 0);
      ctx.fillStyle = '#a5f3fc';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(bn.sub, 0, 26);
      ctx.restore();
    }
  }

  // Big health bar for the Core and the mini-bosses, with a trailing damage bar.
  function drawBossBar() {
    const e = state.enemies.find((x) => x.type === 'boss' || ENEMIES[x.type].mini);
    if (!e) return;
    const t = ENEMIES[e.type];
    const w = 420;
    ctx.save();
    ctx.translate(W / 2, H - 18 * U);
    ctx.scale(U, U);
    const title = e.type === 'boss' ? `THE CORE · PHASE ${['I', 'II', 'III'][e.phase - 1]}` : `${t.title.toUpperCase()}${e.enraged ? ' · ENRAGED' : ''}`;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = e.type === 'boss' && e.phase === 3 ? '#fb7185' : t.color;
    ctx.fillText(title, 0, -16);
    ctx.fillStyle = 'rgba(8, 15, 30, 0.85)';
    roundRect(-w / 2 - 3, -10, w + 6, 14, 7);
    ctx.fill();
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    const shown = clamp((e.shown === undefined ? e.hp : e.shown) / e.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    roundRect(-w / 2, -7, w * shown, 8, 4);
    ctx.fill();
    ctx.fillStyle = e.type === 'boss' && e.phase === 3 ? '#fb7185' : t.color;
    roundRect(-w / 2, -7, Math.max(4, w * frac), 8, 4);
    ctx.fill();
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();
    }
    if (e.type === 'boss') {
      ctx.fillStyle = 'rgba(8, 15, 30, 0.9)';
      for (const m of [0.33, 0.66]) ctx.fillRect(-w / 2 + w * m - 1, -9, 2, 12);
    }
    ctx.restore();
  }

  function drawMinimap() {
    const cell = 18;
    const gap = 7;
    const grid = GRID * cell + (GRID - 1) * gap;
    const pad = 9;
    const pw = grid + pad * 2;
    const ph = grid + pad * 2 + 16;
    ctx.save();
    ctx.translate(W - 12 * U - pw * U, 54 * U);
    ctx.scale(U, U);
    panel(0, 0, pw, ph);
    const rooms = state.world.rooms;
    const known = new Set();
    for (const r of rooms) {
      if (r.visited) {
        known.add(r.id);
        for (const n of Object.values(r.links)) known.add(n);
      }
    }
    const pos = (r) => [pad + r.gx * (cell + gap) + cell / 2, pad + r.gy * (cell + gap) + cell / 2];
    // Doors: solid between explored rooms, faint towards ones only seen.
    ctx.lineWidth = 2;
    for (const r of rooms) {
      if (!r.visited) continue;
      const [ax, ay] = pos(r);
      for (const n of Object.values(r.links)) {
        const b = rooms[n];
        if (b.visited && b.id < r.id) continue;
        const [bx, by] = pos(b);
        ctx.strokeStyle = b.visited ? 'rgba(165, 243, 252, 0.45)' : 'rgba(165, 243, 252, 0.22)';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of rooms) {
      const [cx, cy] = pos(r);
      const x = cx - cell / 2;
      const y = cy - cell / 2;
      const isKnown = known.has(r.id);
      if (r.visited) ctx.fillStyle = dangerColor(r.d, r.cleared ? 0.28 : 0.6);
      else if (isKnown) ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      else ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      roundRect(x, y, cell, cell, 4);
      ctx.fill();
      if (isKnown && !r.visited) {
        ctx.strokeStyle = dangerColor(r.d, 0.8);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (r.id === state.room.id) {
        ctx.strokeStyle = `rgba(236, 254, 255, ${0.7 + 0.3 * Math.sin(state.t * 6)})`;
        ctx.lineWidth = 2.5;
        roundRect(x - 2, y - 2, cell + 4, cell + 4, 5);
        ctx.stroke();
      }
      if (!isKnown) continue;
      // Icons: the Core once found, bosses, events, or the danger level.
      if (r.boss) {
        ctx.fillStyle = '#f472b6';
        polygon(cx, cy, 6.5, 4, state.t * 2);
        ctx.fill();
      } else if (r.mini && !r.cleared) {
        ctx.fillStyle = ENEMIES[r.mini].color;
        polygon(cx, cy, 6, 3, -Math.PI / 2);
        ctx.fill();
      } else if (r.guardian && !r.cleared) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (r.cleared) {
        ctx.strokeStyle = 'rgba(187, 247, 208, 0.9)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy);
        ctx.lineTo(cx - 1, cy + 3);
        ctx.lineTo(cx + 4, cy - 3);
        ctx.stroke();
      } else if (r.id !== state.room.id) {
        ctx.fillStyle = r.visited ? '#0f172a' : dangerColor(r.d, 0.95);
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText(String(r.d), cx, cy + 0.5);
      }
    }
    ctx.textBaseline = 'alphabetic';
    const left = remainingRooms();
    const coreFound = rooms.some((r) => r.boss && known.has(r.id));
    ctx.fillStyle = '#bae6fd';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText(`${left} to clear${coreFound ? ' · Core found' : ''}`, pw / 2, ph - 9);
    ctx.restore();
  }

  // Name card: evolutions, bosses and events, sliding in under the action.
  function drawCard() {
    const cd = state.card;
    if (!cd || state.mode === 'choosing' || state.mode === 'tree') return;
    const max = cd.max === undefined ? cd.t : cd.max;
    const age = max - cd.t;
    const inK = ease(age / 0.4);
    const a = Math.min(inK, clamp(cd.t / 0.5, 0, 1));
    ctx.save();
    ctx.translate(W / 2, H * 0.72);
    ctx.scale(U, U);
    ctx.globalAlpha = a;
    const band = ctx.createLinearGradient(-420, 0, 420, 0);
    band.addColorStop(0, 'rgba(2, 6, 23, 0)');
    band.addColorStop(0.5, 'rgba(2, 6, 23, 0.72)');
    band.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(-420, -50, 840, 92);
    ctx.fillStyle = cd.color;
    const lw = 260 * inK;
    ctx.fillRect(-lw, -50, lw * 2, 1.5);
    ctx.fillRect(-lw, 41, lw * 2, 1.5);
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(cd.kicker.split('').join(' '), 0, -28);
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.4;
    ctx.fillText(cd.title, 0, 10 + (1 - inK) * 10);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cd.title, 0, 9 + (1 - inK) * 10);
    if (cd.sub) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(cd.sub, 0, 32);
    }
    ctx.restore();
  }

  function drawChoice() {
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ecfeff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('Evolve', W / 2, 84);
    ctx.fillStyle = '#a5f3fc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Pick a new form (1 or 2). Lose too much mass and you devolve.', W / 2, 108);
    choiceCards().forEach((c, k) => {
      const f = FORMS[c.form];
      const hot = hover && hover.id === c.id;
      ctx.fillStyle = hot ? 'rgba(34, 211, 238, 0.16)' : 'rgba(15, 23, 42, 0.92)';
      roundRect(c.x, c.y, c.w, c.h, 14);
      ctx.fill();
      ctx.strokeStyle = hot ? f.color : 'rgba(103, 232, 249, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + 78);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(0, 0, 90, f.color);
      ctx.globalCompositeOperation = 'source-over';
      ctx.scale(1.8, 1.8);
      drawTank(0, 0, c.form, TIERS[f.tier] + 40, -Math.PI / 2, state.t, false);
      ctx.restore();
      ctx.fillStyle = f.color;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${k + 1}. ${f.name}`, c.x + c.w / 2, c.y + 156);
      ctx.fillStyle = '#bae6fd';
      ctx.font = '13px system-ui, sans-serif';
      wrap(f.desc, c.x + c.w / 2, c.y + 178, c.w - 30, 16);
      let y = c.y + 220;
      for (const g of gunLines(f)) {
        ctx.fillStyle = '#ecfeff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(g.label, c.x + c.w / 2, y);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(g.stats, c.x + c.w / 2, y + 13);
        y += 30;
      }
      if (f.next.length) {
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`Leads to: ${f.next.map((n) => FORMS[n].name).join(', ')}`, c.x + c.w / 2, c.y + c.h - 12);
      }
    });
    const b = CHOICE_TREE;
    const hot = hover && hover.id === 'tree';
    ctx.fillStyle = hot ? 'rgba(165,243,252,0.3)' : 'rgba(15, 23, 42, 0.92)';
    roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.35)';
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('⌬  Evolution tree (T)', W / 2, b.y + 22);
  }

  function lineage(id) {
    const out = [];
    for (let f = id; f; f = FORMS[f].parent) out.push(f);
    return out;
  }

  function drawTree() {
    const hover = hitTest(input.mx, input.my);
    const cur = state.player.form;
    const owned = new Set(lineage(cur));
    const nextIds = state.mode === 'tree' ? FORMS[cur].next : [];
    const t = state.t + performance.now() / 1000;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ecfeff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Evolution tree', TREE.x, 34);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Absorb shards to climb a tier. Lose mass and you slide back down.', TREE.x, 54);
    // Tier rings.
    [84, 162, 234].forEach((r, k) => {
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(TREE.x, TREE.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`Tier ${k + 1} · ${TIERS[k + 1]}`, TREE.x, TREE.y - r + 13);
    });
    // Links.
    for (const [id, f] of Object.entries(FORMS)) {
      if (!f.parent) continue;
      const a = TREE_POS[f.parent];
      const b = TREE_POS[id];
      const lit = owned.has(id);
      const isNext = nextIds.includes(id);
      ctx.strokeStyle = lit ? f.color : isNext ? 'rgba(236, 254, 255, 0.7)' : 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = lit ? 3 : 2;
      if (isNext) {
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -t * 20;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Nodes.
    for (const n of treeNodes()) {
      const f = FORMS[n.form];
      const isCur = n.form === cur;
      const isOwned = owned.has(n.form);
      const isNext = nextIds.includes(n.form);
      const hot = (hover && hover.id === n.id) || state.treeSel === n.form;
      if (isCur || hot) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(n.cx, n.cy, n.r * 2.6, f.color);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.beginPath();
      ctx.arc(n.cx, n.cy, n.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = isCur ? 3 : 2;
      ctx.strokeStyle = isOwned ? f.color : isNext ? '#ecfeff' : 'rgba(148, 163, 184, 0.35)';
      if (isNext) ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (isCur) {
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.beginPath();
        ctx.arc(n.cx, n.cy, n.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(n.cx, n.cy);
      const k = (n.r * 0.72) / f.r;
      ctx.scale(k, k);
      drawTank(0, 0, n.form, TIERS[f.tier] + 30, -Math.PI / 2, t * 0.6, false, isOwned || isNext || hot ? 1 : 0.4);
      ctx.restore();
      ctx.fillStyle = isOwned ? f.color : isNext ? '#ecfeff' : '#64748b';
      ctx.font = `${isCur ? 'bold ' : ''}11px system-ui, sans-serif`;
      ctx.fillText(f.name, n.cx, n.cy + n.r + 13);
      if (isCur) {
        ctx.fillStyle = f.color;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText('YOU', n.cx, n.cy - n.r - 7);
      }
    }
    // Details for the selected form.
    const sel = FORMS[state.treeSel] ? state.treeSel : cur;
    const f = FORMS[sel];
    const px = 560;
    const py = 70;
    const pw = 410;
    panel(px, py, pw, 418, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = f.color;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(f.name, px + 22, py + 40);
    let status = 'Another branch: devolve and choose again to reach it';
    if (sel === cur) status = 'You are here';
    else if (owned.has(sel)) status = 'Already behind you';
    else if (FORMS[cur].next.includes(sel)) status = `Next: reach ${TIERS[f.tier]} mass`;
    else if (lineage(sel).includes(cur)) status = `Later: reach ${TIERS[f.tier]} mass`;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`Tier ${f.tier} · ${status}`, px + 22, py + 60);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(f.desc, px + 22, py + 88);
    // Stat bars.
    const bars = [
      ['Firepower', clamp(firepower(f) / 420, 0.05, 1)],
      ['Speed', clamp((f.speed - 190) / 70, 0.05, 1)],
      ['Size', clamp(f.r / 28, 0.05, 1)],
    ];
    bars.forEach(([label, v], k) => {
      const y = py + 116 + k * 24;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(label, px + 22, y + 9);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      roundRect(px + 100, y, 280, 10, 5);
      ctx.fill();
      ctx.fillStyle = f.color;
      roundRect(px + 100, y, 280 * v, 10, 5);
      ctx.fill();
    });
    ctx.fillStyle = '#ecfeff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('Guns', px + 22, py + 210);
    let y = py + 232;
    for (const g of gunLines(f)) {
      ctx.fillStyle = f.color;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(g.label, px + 22, y);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(g.stats, px + 22, y + 16);
      y += 38;
    }
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(f.next.length ? `Leads to: ${f.next.map((n) => FORMS[n].name).join(' or ')}` : 'A final form.', px + 22, py + 400);
    // Close.
    const b = TREE_CLOSE;
    const hot = hover && hover.id === b.id;
    ctx.fillStyle = hot ? 'rgba(165,243,252,0.3)' : 'rgba(15, 23, 42, 0.95)';
    roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.35)';
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Close (T)', b.x + b.w / 2, b.y + 22);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Hover or tap a form for details.', px, b.y + 22);
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
    return n + 1;
  }

  function drawTutorial() {
    const tut = state.tut;
    if (!tut || state.mode !== 'playing' || tut.step >= TUT.length) return;
    const { box, skip } = tutBox();
    const tip = TUT[tut.step];
    const text = input.lastTouch && tip.touch ? tip.touch : tip.key;
    const hover = hitTest(input.mx, input.my);
    ctx.save();
    ctx.globalAlpha = clamp(tut.t * 3 + (tut.wait > 0 ? 1 : 0), 0, 1);
    ctx.fillStyle = 'rgba(8, 15, 30, 0.88)';
    roundRect(box.x, box.y, box.w, box.h, 12 * U);
    ctx.fill();
    ctx.strokeStyle = tut.ok ? '#4ade80' : 'rgba(103, 232, 249, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = tut.ok ? '#4ade80' : '#67e8f9';
    ctx.font = `bold ${10 * U}px system-ui, sans-serif`;
    ctx.fillText(tut.ok ? '✓ NICE' : `TIP ${tut.step + 1} OF ${TUT.length}`, box.x + 16 * U, box.y + 19 * U);
    ctx.fillStyle = '#ecfeff';
    ctx.font = `${13 * U}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    wrap(text, box.x + 16 * U, box.y + 37 * U, box.w - 110 * U, 15 * U);
    ctx.fillStyle = hover && hover.id === 'tutskip' ? 'rgba(165,243,252,0.3)' : 'rgba(255,255,255,0.08)';
    roundRect(skip.x, skip.y, skip.w, skip.h, 6 * U);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 ${11 * U}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Skip', skip.x + skip.w / 2, skip.y + skip.h / 2 + 4 * U);
    ctx.restore();
  }

  // Twin-stick touch controls: a base where the thumb landed, a knob under it.
  function drawSticks() {
    if (state.mode !== 'playing') return;
    const R = STICK_R * U;
    const sticks = [[input.touch.move, '#67e8f9', 'MOVE'], [input.touch.aim, '#f0abfc', 'AIM · FIRE']];
    for (const [st, col, label] of sticks) {
      if (!st) {
        // Ghost hints for touch players.
        if (!input.lastTouch) continue;
        const hx = label === 'MOVE' ? 90 * U : W - 90 * U;
        const hy = H - 80 * U;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, R * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = `600 ${10 * U}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(label, hx, hy + 4);
        continue;
      }
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(st.ox, st.oy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(st.ox + dx * k, st.oy + dy * k, 22 * U, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCursor() {
    const over = hitTest(input.mx, input.my);
    const aiming = state && state.mode === 'playing' && input.over && !over && !input.lastTouch;
    canvas.style.cursor = aiming ? 'none' : over ? 'pointer' : 'default';
    if (!aiming) return;
    const k = input.down ? 0.8 : 1;
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(input.mx, input.my, 9 * k, 0, Math.PI * 2);
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
  let overlayKind = null;

  function formatTime(t) {
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }

  function settingsRow() {
    const b = (key, label) => `<button type="button" class="toggle" data-set="${key}" aria-pressed="${settings[key]}">${label}: ${settings[key] ? 'On' : 'Off'}</button>`;
    return `
      <div class="row settings">
        ${b('shake', 'Screen shake')}
        ${b('reduced', 'Reduced effects')}
        ${b('assist', 'Touch aim assist')}
        <button type="button" class="toggle" data-act="tutorial">Replay tutorial</button>
      </div>`;
  }

  function showOverlay(kind) {
    overlayKind = kind;
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    const best = loadBest();
    const bestLine = best
      ? `<p class="help">Best run: ${best.won ? `shattered the Core in ${formatTime(best.time)}` : `reached depth ${best.depth}`} as ${best.form}.</p>`
      : '';
    const endless = loadJSON('nameless-tanks-endless', null);
    const endlessLine = endless && endless.loops > 1 ? `<p class="help">Endless record: ${endless.loops} loops cleared.</p>` : '';
    const date = todayKey();
    const mod = dailyMod(date);
    const daily = loadDaily(date);
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2>Nameless Tanks</h2>
          <p>Roam a web of crystal arenas. Shatter enemies, absorb their shards to grow, and evolve through eleven forms. Find and destroy the Core.</p>
          <div class="row">
            <button type="button" class="primary" data-act="start">Play</button>
            <button type="button" data-act="daily">Daily Challenge</button>
          </div>
          <p class="help">Daily ${date}: <b>${mod.name}</b>. ${mod.desc} Same world for everyone today.${daily ? ` Your best today: ${daily.score.toLocaleString()}.` : ''}</p>
          <p class="help controls">WASD or arrows move · mouse aims · hold click or Space to fire · T evolution tree · P pause<br>Phones: left thumb moves, right thumb aims and fires.</p>
          ${bestLine}${endlessLine}
          ${settingsRow()}
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div>
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
          ${settingsRow()}
        </div>`;
    } else if (kind === 'over') {
      const s = state.stats;
      const r = state.result || { score: runScore() };
      const loop = state.run.loop;
      let title = 'Shattered';
      if (state.won) title = loop ? `Loop ${loop + 1} cleared` : 'The Core is shattered';
      const line = state.won
        ? `You won in ${formatTime(state.t)} as ${form().name}.`
        : `You fell at depth ${state.room.d}${loop ? ` on loop ${loop + 1}` : ''} after ${formatTime(state.t)}.`;
      let scoreLine = `Score ${r.score.toLocaleString()}`;
      if (state.run.daily) {
        scoreLine += r.newDaily ? ' · new best today!' : r.prevDaily ? ` · today's best ${r.prevDaily.score.toLocaleString()}` : '';
      }
      const again = state.run.daily ? 'daily' : 'start';
      overlay.innerHTML = `
        <div>
          <h2>${title}</h2>
          <p>${line}</p>
          <p>${s.kills} enemies · ${s.rooms} rooms explored · deepest ${s.deepest}${s.loops ? ` · ${s.loops} loop${s.loops > 1 ? 's' : ''}` : ''}</p>
          <p class="help">${state.run.daily ? `Daily ${state.run.date} · ` : ''}${scoreLine}</p>
          ${state.run.daily ? '' : bestLine}
          <div class="row">
            ${state.won ? `<button type="button" class="primary" data-act="endless">Endless: loop ${loop + 2}</button>` : ''}
            <button type="button"${state.won ? '' : ' class="primary"'} data-act="${again}">${state.run.daily ? 'Retry daily' : 'Play again'}</button>
            <button type="button" data-act="menu">Menu</button>
          </div>
          ${state.won ? '<p class="help">Endless keeps your tank and builds a deeper, angrier web.</p>' : ''}
        </div>`;
    }
    overlay.classList.add('open');
  }

  function showMenu() {
    newGame();
    state.mode = 'menu';
    state.tut = null;
    showOverlay('menu');
  }

  function start(opts) {
    newGame(opts || {});
    showOverlay(null);
  }

  function clearTouches() {
    input.down = false;
    input.touch.move = null;
    input.touch.aim = null;
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'tree') {
      toggleTree();
      return;
    }
    if (state.mode === 'playing') {
      state.mode = 'paused';
      clearTouches();
      showOverlay('paused');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      showOverlay(null);
    }
  }

  function toggleTree() {
    if (!state) return;
    if (state.mode === 'tree') {
      state.mode = state.treeReturn || 'playing';
      Sound.click();
    } else if (state.mode === 'playing' || state.mode === 'choosing') {
      state.treeReturn = state.mode;
      state.mode = 'tree';
      state.treeSel = state.player.form;
      clearTouches();
      if (state.tut) state.tut.treeSeen = true;
      Sound.click();
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
    else if (id === 'tree' || id === 'tree-close') toggleTree();
    else if (id === 'tutskip') {
      finishTutorial();
      Sound.click();
    } else if (id.startsWith('node:')) {
      state.treeSel = id.slice(5);
      Sound.click();
    } else if (id.startsWith('choose:') && state.mode === 'choosing') choose(id.slice(7));
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    Sound.click();
    if (b.dataset.set) {
      settings[b.dataset.set] = !settings[b.dataset.set];
      saveSettings();
      showOverlay(overlayKind);
      return;
    }
    const act = b.dataset.act;
    if (act === 'start') start();
    else if (act === 'daily') start({ daily: true });
    else if (act === 'resume') togglePause();
    else if (act === 'menu') showMenu();
    else if (act === 'endless') continueEndless();
    else if (act === 'tutorial') {
      saveJSON('nameless-tanks-tutorial', false);
      start();
    }
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    if (isTouch(e)) {
      for (const slot of ['move', 'aim']) {
        const st = input.touch[slot];
        if (!st || st.id !== e.pointerId) continue;
        st.x = p.x;
        st.y = p.y;
        // The base follows a thumb that drifts too far.
        const dx = st.x - st.ox;
        const dy = st.y - st.oy;
        const d = Math.hypot(dx, dy);
        const max = STICK_R * U * 1.25;
        if (d > max) {
          st.ox += (dx / d) * (d - max);
          st.oy += (dy / d) * (d - max);
        }
      }
      return;
    }
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
    input.lastTouch = false;
    if (state && state.mode === 'tree') {
      const hit = hitTest(p.x, p.y);
      if (hit && hit.id.startsWith('node:')) state.treeSel = hit.form;
    }
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (!isTouch(e)) input.over = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const touch = isTouch(e);
    if (!touch && e.button !== 0) return;
    const p = toCanvas(e);
    input.lastTouch = touch;
    if (!touch) {
      input.mx = p.x;
      input.my = p.y;
      input.over = true;
    }
    const hit = hitTest(p.x, p.y);
    if (hit) {
      activate(hit.id);
      return;
    }
    if (!state || state.mode !== 'playing') return;
    if (touch) {
      e.preventDefault();
      const slot = p.x < W / 2 ? 'move' : 'aim';
      input.touch[slot] = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    } else {
      input.down = true;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; dragging still works without it.
    }
  });
  const release = (e) => {
    for (const slot of ['move', 'aim']) {
      if (input.touch[slot] && input.touch[slot].id === e.pointerId) input.touch[slot] = null;
    }
    if (!isTouch(e)) input.down = false;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.muted = !Sound.muted; return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 't') { toggleTree(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (state && state.mode === 'choosing' && (k === '1' || k === '2')) {
      const c = choiceCards()[Number(k) - 1];
      if (c) choose(c.form);
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      input.keys.add(k);
      input.lastTouch = false;
      if (overlayKind === null) e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    input.keys.clear();
    clearTouches();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && state.mode === 'playing' && !AUTOPLAY) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const raw = (now - last) / 1000;
    const real = Math.min(0.05, raw);
    last = now;
    // Adaptive resolution: if frames stay slow for a while, render fewer pixels.
    if (raw > 0.03 && raw < 0.5) slowT += raw;
    else slowT = Math.max(0, slowT - raw * 0.5);
    if (slowT > 2.5 && renderScale > 0.55) {
      renderScale *= 0.8;
      slowT = 0;
      resize();
    }
    if (state) advance(real * SPEED);
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing (?autoplay plays with a bot, ?seed=N fixes the world).
  window.__nt = {
    get state() { return state; },
    input,
    settings,
    start,
    startDaily: () => start({ daily: true }),
    choose,
    endless: continueEndless,
    tree: toggleTree,
    makeWorld,
    enter: (id) => enterRoom(id, null),
    spawn: (type) => spawnEnemy(type, true),
    FORMS,
    ENEMIES,
    step(dt) {
      advance(dt);
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
