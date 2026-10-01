'use strict';

// Nameless Nuke: a cold-war strategy game on a glowing world map. Lead one
// continent, build silos, radar, airbases, fleets, submarines, armies and
// satellites while the DEFCON level counts down, then survive the exchange.
// Score for enemy casualties, lose score for your own. Everything is drawn
// on one canvas. The map zooms and pans, and every game is recorded so it
// can be watched back from the results screen.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const SAVE_KEY = 'nameless-nuke';

  // DEFCON level starts (game seconds). The game ends at END.
  const DEFCON_AT = { 5: 0, 4: 60, 3: 120, 2: 200, 1: 260 };
  const END = 560;

  const START_CREDITS = 260;
  const INCOME = 0.025; // credits per second per million people
  const BLAST = 24; // nuke radius in px
  const ZOOM_MAX = 3;
  const SNAP_EVERY = 4; // replay snapshot interval (game seconds)

  // Unit types. cost, vision (px), speed (px/s), what they carry, and the
  // reach ring shown while placing them.
  const UNITS = {
    silo: { name: 'Missile silo', cost: 60, vision: 40, key: 'S', reach: 150, reachName: 'intercept range', desc: 'Holds 6 missiles. Shoots down incoming missiles and bombers while in defend mode.' },
    radar: { name: 'Radar', cost: 25, vision: 165, key: 'R', desc: 'Reveals enemy units and missiles in a wide circle.' },
    airbase: { name: 'Airbase', cost: 50, vision: 50, key: 'B', reach: 400, reachName: 'bomber range', desc: 'Launches fighters (scout, intercept) and bombers (carry a nuke).' },
    army: { name: 'Army', cost: 20, vision: 45, speed: 16, key: 'A', desc: 'Defends your cities. From DEFCON 3 it can invade a neighbouring continent’s city.' },
    fleet: { name: 'Battle fleet', cost: 40, vision: 95, speed: 22, key: 'N', reach: 75, reachName: 'gun range', desc: 'Moves by sea. Sinks enemy ships and shoots down missiles.' },
    sub: { name: 'Submarine', cost: 55, vision: 40, speed: 18, key: 'U', reach: 280, reachName: 'missile range', desc: 'Hidden unless ships come close. Carries 3 short-range missiles.' },
    satellite: { name: 'Satellite', cost: 90, vision: 115, speed: 34, key: 'T', desc: 'Orbits the planet and reveals everything beneath it. Up to 3.' },
  };
  const BUILD_ORDER = ['silo', 'radar', 'airbase', 'army', 'fleet', 'sub', 'satellite'];
  const BUILDINGS = ['silo', 'radar', 'airbase'];

  // What each DEFCON level means (banner title, explanation, timeline tag).
  const DEFCON_INFO = {
    5: { title: 'Peacetime', sub: 'Build your defences. Nothing can fire yet.', tag: 'BUILD', soon: 'peacetime' },
    4: { title: 'Raised readiness', sub: 'Fighters may now scramble to scout enemy land.', tag: 'SCOUT', soon: 'fighters may scramble' },
    3: { title: 'Conventional war', sub: 'Fleets, fighters and silo defences engage. Armies may invade.', tag: 'WAR', soon: 'war and invasions' },
    2: { title: 'Imminent', sub: 'Last chance to prepare: switch silos to launch mode.', tag: 'ARM', soon: 'arm your silos' },
    1: { title: 'Nuclear launch authorised', sub: 'Silos, submarines and bombers may fire.', tag: 'NUKES', soon: 'nuclear launch' },
  };

  const NATIONS = [
    { name: 'You', color: '#38bdf8' },
    { name: 'Crimson', color: '#f43f5e' },
    { name: 'Verdant', color: '#4ade80' },
    { name: 'Amber', color: '#fbbf24' },
    { name: 'Violet', color: '#c084fc' },
    { name: 'Ivory', color: '#e2e8f0' },
  ];

  // AI personalities: what they build, when they strike and how they fight.
  const PERSONAS = {
    aggressive: {
      label: 'Aggressive',
      want: { silo: 7, radar: 1, airbase: 2, army: 5, fleet: 3, sub: 1, satellite: 1 },
      extra: ['silo', 'silo', 'army', 'fleet'],
      nukeAt: [3, 14], keep: 0.15, invade: 0.3, odds: 1.4, retaliate: 3, bomb: 0.7,
    },
    defensive: {
      label: 'Defensive',
      want: { silo: 8, radar: 3, airbase: 1, army: 5, fleet: 3, sub: 0, satellite: 1 },
      extra: ['silo', 'silo', 'army', 'fleet'],
      nukeAt: [15, 35], keep: 0.35, invade: 0.08, odds: 0.9, retaliate: 1, bomb: 0.5,
    },
    sneaky: {
      label: 'Sneaky',
      want: { silo: 4, radar: 2, airbase: 1, army: 3, fleet: 2, sub: 4, satellite: 2 },
      extra: ['sub', 'silo', 'sub', 'fleet'],
      nukeAt: [10, 35], keep: 0.3, invade: 0.12, odds: 1.1, retaliate: 4, bomb: 0.5,
    },
  };
  const PERSONA_IDS = Object.keys(PERSONAS);

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const SPEED = Math.min(64, Math.max(0.25, Number(params.get('speed')) || 1));
  const REDUCED = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();

  // ---------------------------------------------------------------------------
  // The world (rough shapes in longitude/latitude, projected onto the canvas)
  // ---------------------------------------------------------------------------

  const proj = ([lon, lat]) => ({ x: ((lon + 170) / 360) * W, y: 44 + ((82 - lat) / 142) * 496 });

  const REGIONS = {
    na: {
      name: 'North America',
      polys: [
        [[-168, 66], [-162, 70], [-140, 70], [-125, 72], [-95, 74], [-80, 73], [-68, 62], [-60, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-84, 30], [-90, 29], [-97, 26], [-97, 21], [-92, 18], [-87, 21], [-88, 15], [-83, 9], [-78, 8], [-86, 12], [-95, 16], [-105, 20], [-110, 24], [-115, 30], [-118, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-150, 60], [-160, 58], [-165, 62]],
        [[-55, 60], [-44, 60], [-22, 70], [-20, 80], [-60, 82], [-72, 77], [-56, 70]],
      ],
      cities: [['New York', -74, 41, 19], ['Los Angeles', -118, 34, 13], ['Chicago', -88, 42, 9], ['Houston', -95, 30, 7], ['Toronto', -79, 44, 6], ['Mexico City', -99, 19.5, 21], ['Seattle', -122, 47.5, 4], ['Atlanta', -84, 34, 6], ['Denver', -105, 40, 3]],
    },
    sa: {
      name: 'South America',
      polys: [[[-78, 8], [-72, 12], [-62, 10], [-50, 0], [-35, -6], [-38, -13], [-40, -22], [-48, -28], [-58, -38], [-65, -42], [-68, -52], [-72, -54], [-75, -50], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0]]],
      cities: [['São Paulo', -46.6, -23.5, 22], ['Buenos Aires', -58.4, -34.6, 15], ['Rio de Janeiro', -43.2, -22.9, 13], ['Lima', -77, -12, 11], ['Bogotá', -74, 4.6, 11], ['Santiago', -70.6, -33.4, 7], ['Caracas', -66.9, 10.5, 5], ['Manaus', -60, -3.1, 2]],
    },
    eu: {
      name: 'Europe',
      polys: [
        [[-10, 36], [-9, 43], [-1, 46], [-4, 48], [2, 51], [8, 54], [8, 57], [5, 59], [5, 62], [12, 66], [18, 70], [28, 71], [30, 62], [28, 56], [32, 52], [30, 46], [28, 41], [26, 38], [22, 36], [20, 40], [16, 38], [18, 41], [13, 44], [12, 38], [8, 44], [3, 43], [0, 38], [-6, 36]],
        [[-6, 50], [2, 51], [0, 53], [-3, 56], [-6, 58], [-5, 54]],
      ],
      cities: [['London', -0.1, 51.5, 14], ['Paris', 2.3, 48.9, 11], ['Berlin', 13.4, 52.5, 6], ['Madrid', -3.7, 40.4, 7], ['Rome', 12.5, 41.9, 4], ['Warsaw', 21, 52.2, 3], ['Stockholm', 18, 59.3, 2.5], ['Kyiv', 30.5, 50.4, 4], ['Athens', 23.7, 38, 3]],
    },
    af: {
      name: 'Africa',
      polys: [
        [[-17, 21], [-16, 12], [-12, 7], [-8, 4], [0, 5], [8, 4], [9, 0], [12, -5], [13, -12], [12, -17], [15, -27], [18, -34], [22, -34], [28, -33], [33, -25], [35, -20], [40, -15], [40, -8], [44, -2], [51, 11], [43, 12], [38, 18], [34, 27], [32, 31], [20, 32], [10, 37], [0, 36], [-6, 35], [-10, 30]],
        [[44, -13], [50, -15], [49, -25], [45, -25], [43, -18]],
      ],
      cities: [['Lagos', 3.4, 6.5, 16], ['Cairo', 31.2, 30, 21], ['Kinshasa', 15.3, -4.3, 15], ['Johannesburg', 28, -26.2, 10], ['Nairobi', 36.8, -1.3, 5], ['Addis Ababa', 38.7, 9, 5], ['Algiers', 3, 36.3, 4], ['Luanda', 13.2, -8.8, 9], ['Dakar', -17, 14.7, 3]],
    },
    ru: {
      name: 'Russia',
      polys: [[[30, 70], [40, 68], [60, 70], [80, 73], [100, 77], [120, 73], [140, 72], [160, 70], [178, 68], [178, 64], [170, 60], [162, 57], [158, 51], [150, 58], [140, 54], [135, 48], [120, 52], [100, 50], [88, 49], [80, 50], [70, 53], [60, 51], [52, 46], [48, 42], [40, 43], [36, 46], [32, 52], [28, 56], [30, 62]]],
      cities: [['Moscow', 37.6, 55.8, 12], ['St Petersburg', 30.8, 59.9, 6], ['Novosibirsk', 83, 55, 3], ['Yekaterinburg', 60.6, 56.8, 3], ['Kazan', 49, 55.8, 2.5], ['Omsk', 73.4, 55, 2], ['Irkutsk', 104.3, 53.5, 1.5], ['Yakutsk', 129.7, 62, 1], ['Khabarovsk', 136, 50.5, 1.5]],
    },
    as: {
      name: 'Asia',
      polys: [
        [[27, 40], [36, 42], [40, 43], [48, 42], [52, 46], [60, 51], [70, 53], [80, 50], [88, 49], [100, 50], [120, 52], [135, 48], [130, 42], [127, 35], [122, 31], [121, 25], [110, 20], [108, 15], [106, 10], [103, 2], [98, 8], [98, 16], [92, 21], [88, 22], [80, 15], [77, 8], [72, 20], [67, 24], [60, 25], [56, 26], [50, 30], [48, 29], [52, 24], [58, 22], [55, 17], [44, 12], [40, 16], [35, 28], [34, 32], [36, 36], [30, 36], [27, 37]],
        [[130, 32], [140, 35], [142, 41], [145, 44], [141, 45], [139, 40], [135, 35]],
      ],
      cities: [['Tokyo', 139.7, 35.7, 37], ['Shanghai', 121.3, 31.2, 27], ['Beijing', 116.4, 39.9, 21], ['Delhi', 77.2, 28.6, 31], ['Mumbai', 73.2, 19.5, 21], ['Seoul', 127, 37.6, 25], ['Tehran', 51.4, 35.7, 9], ['Bangkok', 100.5, 14.5, 11], ['Dhaka', 90.4, 23.8, 21], ['Istanbul', 29.5, 40.5, 15]],
    },
  };
  const REGION_IDS = ['na', 'sa', 'eu', 'af', 'ru', 'as'];
  // Where armies can march (or be shipped) to.
  const ADJ = { na: ['sa', 'ru'], sa: ['na', 'af'], eu: ['af', 'ru', 'as'], af: ['eu', 'as', 'sa'], ru: ['eu', 'as', 'na'], as: ['ru', 'eu', 'af'] };
  // Land that belongs to nobody.
  const WILD = [
    [[114, -22], [114, -34], [118, -35], [130, -32], [138, -35], [146, -39], [150, -37], [153, -28], [153, -25], [146, -19], [142, -11], [136, -12], [130, -12], [122, -17]],
    [[95, 5], [106, -6], [115, -8], [118, -3], [110, 1], [100, 2]],
    [[-24, 64], [-14, 64], [-14, 66], [-22, 66.5]],
  ].map((p) => p.map(proj));

  for (const r of Object.values(REGIONS)) {
    r.shapes = r.polys.map((p) => p.map(proj));
    // Scale each continent to 100 million people so every choice is even.
    const total = r.cities.reduce((s, c) => s + c[3], 0);
    r.cityList = r.cities.map(([name, lon, lat, pop]) => ({ name, ...proj([lon, lat]), pop: (pop / total) * 100 }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }

  function regionAt(pt) {
    for (const id of REGION_IDS) if (REGIONS[id].shapes.some((s) => inPoly(pt, s))) return id;
    return null;
  }

  const isLand = (pt) => !!regionAt(pt) || WILD.some((s) => inPoly(pt, s));

  function distToShapes(pt, shapes) {
    let best = Infinity;
    for (const s of shapes) {
      for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
        const a = s[j];
        const b = s[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const k = clamp(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
        best = Math.min(best, Math.hypot(a.x + dx * k - pt.x, a.y + dy * k - pt.y));
      }
    }
    return best;
  }

  // True if a straight voyage from a to b stays at sea.
  function seaPath(a, b) {
    const n = Math.ceil(dist(a, b) / 6);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (isLand({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  // Point on a missile's flight curve (quadratic Bézier) at progress k.
  function bez(m, k) {
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const c = k * k;
    return { x: a * m.sx + b * m.cx + c * m.tx, y: a * m.sy + b * m.cy + c * m.ty };
  }

  function formatTime(t) {
    t = Math.max(0, Math.ceil(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  const DEFAULT_SAVE = { region: 'na', rivals: 3, games: 0, wins: 0, best: null, tutorial: true };

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

  // True while simulate() runs whole games: no sound or screen effects then.
  let simulating = false;

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
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    play(name, gap, fn) {
      if (simulating || this.muted || !this.ctx || this.ctx.state !== 'running') return;
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

    noise(dur, vol, freq, delay = 0) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(c.destination);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur);
    },

    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.05)); },
    build() { this.play('build', 0.05, () => { this.tone(520, 0.06, 'square', 0.03); this.tone(780, 0.08, 'square', 0.025, null, 0.06); }); },
    bad() { this.play('bad', 0.2, () => this.tone(160, 0.14, 'square', 0.03)); },
    launch() { this.play('launch', 0.15, () => { this.noise(0.9, 0.09, 1200); this.tone(180, 0.8, 'sawtooth', 0.02, 720); }); },
    blip() { this.play('blip', 0.4, () => this.tone(1200, 0.06, 'sine', 0.025, 900)); },
    // A close detonation is a crack and a long rumble; a far one just rumbles.
    boom(near = 1) {
      this.play('boom', 0.12, () => {
        if (near > 0.6) this.noise(0.25, 0.25 * near, 4000);
        this.noise(2.4, 0.3 * near + 0.05, 420);
        this.tone(60, 1.8, 'sine', 0.22 * near + 0.04, 24);
        this.noise(1.6, 0.08, 160, 0.35);
      });
    },
    intercept() { this.play('icpt', 0.08, () => { this.tone(1600, 0.09, 'square', 0.02, 600); this.noise(0.15, 0.04, 2500); }); },
    gun() { this.play('gun', 0.12, () => this.noise(0.06, 0.05, 3000)); },
    alarm() {
      this.play('alarm', 1.5, () => [0, 0.35, 0.7].forEach((d) => this.tone(880, 0.25, 'square', 0.04, 660, d)));
    },
    defcon() {
      this.play('defcon', 1, () => {
        [440, 330].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, null, i * 0.4));
        this.tone(55, 1.2, 'sine', 0.12, 40);
      });
    },
    // Air-raid siren for DEFCON 1: a rising and falling wail.
    siren() {
      this.play('siren', 6, () => {
        const c = this.ctx;
        const t = c.currentTime;
        const o = c.createOscillator();
        const o2 = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = 'sawtooth';
        o2.type = 'square';
        f.type = 'lowpass';
        f.frequency.value = 1500;
        for (const osc of [o, o2]) {
          const m = osc === o ? 1 : 1.006;
          osc.frequency.setValueAtTime(300 * m, t);
          for (let k = 0; k < 3; k++) {
            osc.frequency.linearRampToValueAtTime(820 * m, t + k * 1.5 + 1);
            osc.frequency.linearRampToValueAtTime(320 * m, t + (k + 1) * 1.5);
          }
          osc.connect(f);
          osc.start(t);
          osc.stop(t + 4.7);
        }
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.5);
        g.gain.setValueAtTime(0.045, t + 3.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
        f.connect(g).connect(c.destination);
      });
    },
    end() {
      this.play('end', 1, () => [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.07, null, i * 0.18)));
    },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  let nextId = 1;

  function makeAi(persona) {
    const p = PERSONAS[persona];
    return { persona, think: rand(0.5, 2), grudge: {}, nukeAt: rand(p.nukeAt[0], p.nukeAt[1]), launched: false };
  }

  // A city is drawn as a cluster of lights; each light goes dark once the
  // population falls below its threshold.
  function makeLights(c) {
    const n = Math.round(clamp(5 + c.pop0 * 1.5, 6, 46));
    const spread = 2 + Math.sqrt(c.pop0) * 1.5;
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * Math.sqrt(-Math.log(1 - Math.random() * 0.95)) * 0.7;
      out.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.8, th: Math.random(), s: rand(0.6, 1.3) });
    }
    return out;
  }

  function newGame(opts = {}) {
    const home = opts.region || save.region;
    const rivals = clamp(opts.rivals ?? save.rivals, 1, 5);
    const others = shuffle(REGION_IDS.filter((r) => r !== home)).slice(0, rivals);
    const regions = [home, ...others];
    // Deal personalities so a table of rivals is a mix of styles.
    const deck = shuffle([...PERSONA_IDS, ...shuffle([...PERSONA_IDS])]);
    state = {
      mode: 'playing',
      t: 0,
      speed: 1,
      defcon: 5,
      nations: regions.map((r, k) => {
        const bot = k > 0 || AUTOPLAY || opts.bot;
        const persona = bot ? (opts.personas && opts.personas[k]) || deck[k % deck.length] : null;
        return {
          id: k,
          region: r,
          name: k === 0 ? 'You' : NATIONS[k].name,
          color: NATIONS[k].color,
          credits: START_CREDITS,
          kills: 0,
          losses: 0,
          score: 0,
          alive: true,
          fired: 0,
          persona,
          ai: bot ? makeAi(persona) : null,
        };
      }),
      cities: [],
      units: [],
      missiles: [],
      craters: [],
      tracers: [],
      log: [],
      events: [],
      rec: { missiles: [], blasts: [], marks: [], snaps: [], nextSnap: 0, end: 0 },
      placing: null,
      selected: null,
      action: null,
      over: false,
      endT: 0,
      tut: null,
    };
    for (const n of state.nations) {
      for (const c of REGIONS[n.region].cityList) {
        const city = { id: nextId++, ...c, pop0: c.pop, region: n.region, owner: n.id, garrison: 15 };
        city.lights = makeLights(city);
        state.cities.push(city);
      }
    }
    snapshot();
    background = null;
    landDots = null;
  }

  const me = () => state.nations[0];
  const nationOf = (region) => state.nations.find((n) => n.region === region);
  const popOf = (id) => state.cities.reduce((s, c) => s + (c.owner === id ? c.pop : 0), 0);
  const owned = (id, type) => state.units.reduce((s, u) => s + (u.owner === id && u.type === type ? 1 : 0), 0);

  function log(text, color = '#cbd5e1') {
    state.log.unshift({ text, color, t: 12 });
    if (state.log.length > 6) state.log.length = 6;
  }

  // Key moments go to the escalation log shown on the pause and results screens.
  function escalate(text, color = '#cbd5e1', quiet = false) {
    state.events.push({ t: state.t, text, color });
    if (state.events.length > 80) state.events.shift();
    if (!quiet) log(text, color);
  }

  // Cheap recording for the replay: city populations, owners and scores.
  function snapshot() {
    const r = state.rec;
    r.snaps.push({
      t: state.t,
      pop: state.cities.map((c) => Math.round(c.pop * 100) / 100),
      own: state.cities.map((c) => c.owner),
      score: state.nations.map((n) => n.score),
    });
    r.nextSnap = state.t + SNAP_EVERY;
  }

  // ---------------------------------------------------------------------------
  // Building
  // ---------------------------------------------------------------------------

  // Why a unit can't go at pt, or null if it can.
  function placeIssue(owner, type, pt) {
    const n = state.nations[owner];
    const R = REGIONS[n.region];
    if (type === 'satellite') return owned(owner, 'satellite') >= 3 ? 'Only 3 satellites allowed' : null;
    if (type === 'fleet' || type === 'sub') {
      if (isLand(pt)) return 'Must be at sea';
      return distToShapes(pt, R.shapes) < 55 ? null : 'Must be near your coast';
    }
    if (!R.shapes.some((s) => inPoly(pt, s))) return 'Must be on your land';
    if (distToShapes(pt, R.shapes) < 4) return 'Too close to the coast';
    if (state.units.some((u) => u.owner === owner && !u.air && BUILDINGS.includes(u.type) && dist(u, pt) < 14)) return 'Too close to another building';
    return null;
  }

  const canPlace = (owner, type, pt) => !placeIssue(owner, type, pt);

  function build(owner, type, pt) {
    const n = state.nations[owner];
    const def = UNITS[type];
    if (n.credits < def.cost || !canPlace(owner, type, pt)) return null;
    n.credits -= def.cost;
    const u = { id: nextId++, type, owner, x: pt.x, y: pt.y, hp: 10, cd: 0, dest: null, revealed: 0, born: state.t };
    if (type === 'silo') Object.assign(u, { mode: 'defend', switchT: 0, missiles: 6 });
    if (type === 'airbase') Object.assign(u, { fighters: 4, bombers: 2 });
    if (type === 'army') Object.assign(u, { str: 10 });
    if (type === 'sub') Object.assign(u, { missiles: 3 });
    if (type === 'satellite') {
      const home = REGIONS[n.region].cityList[0];
      Object.assign(u, { phase: pt.x, y0: clamp(home.y, 150, 450), amp: rand(110, 170), x: pt.x });
    }
    state.units.push(u);
    if (owner === 0 && !simulating) fx.pings.push({ x: u.x, y: u.y, at: fx.now });
    return u;
  }

  // ---------------------------------------------------------------------------
  // Vision
  // ---------------------------------------------------------------------------

  // Can nation `id` see point p?
  function sees(id, p, sub = false) {
    const n = state.nations[id];
    if (!sub && REGIONS[n.region].shapes.some((s) => inPoly(p, s))) return true;
    for (const u of state.units) {
      if (u.owner !== id) continue;
      let v = UNITS[u.type] ? UNITS[u.type].vision : 60;
      if (sub) v = u.type === 'fleet' || u.type === 'sub' ? 50 : 0;
      if (v && dist(u, p) < v) return true;
    }
    return false;
  }

  function visibleUnit(id, u) {
    if (u.owner === id) return true;
    if (u.revealed > state.t) return true;
    if (u.type === 'sub') return sees(id, u, true);
    if (u.type === 'satellite') return true;
    return sees(id, u);
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  function setSiloMode(u, mode) {
    if (u.type !== 'silo' || u.mode === mode || u.switchT > 0) return false;
    u.switchT = 8;
    u.nextMode = mode;
    return true;
  }

  // Will a missile aimed at (x, y) hurt nation 0?
  function threatensMe(owner, x, y) {
    if (owner === 0) return false;
    if (state.cities.some((c) => c.owner === 0 && c.pop > 0.2 && Math.hypot(c.x - x, c.y - y) < BLAST * 1.4)) return true;
    return state.units.some((u) => u.owner === 0 && !u.air && u.type !== 'satellite' && Math.hypot(u.x - x, u.y - y) < BLAST);
  }

  function launchMissile(owner, from, target, kind) {
    const d = dist(from, target);
    const speed = kind === 'sub' ? 70 : 52;
    // Arc toward the pole for a globe-ish flight path.
    const mx = (from.x + target.x) / 2;
    const my = (from.y + target.y) / 2 - Math.min(160, d * 0.35);
    const m = { id: nextId++, owner, kind, sx: from.x, sy: from.y, cx: mx, cy: my, tx: target.x, ty: target.y, t: 0, dur: d / speed + 1.5, trail: [], trailT: 0, x: from.x, y: from.y };
    m.threat = threatensMe(owner, m.tx, m.ty);
    m.rec = { o: owner, sx: m.sx, sy: m.sy, cx: m.cx, cy: m.cy, tx: m.tx, ty: m.ty, t0: state.t, dur: m.dur, te: null, hit: false };
    state.missiles.push(m);
    state.rec.missiles.push(m.rec);
    const n = state.nations[owner];
    if (!n.fired) {
      const first = !state.nations.some((o) => o.fired);
      n.fired = 1;
      escalate(first ? `FIRST STRIKE: ${n.name} launches` : `${n.name} joins the exchange`, n.color);
      if (first && !simulating) banner('FIRST STRIKE', `${n.name === 'You' ? 'You have' : `${n.name} has`} launched`, n.color);
    } else n.fired++;
    if (owner === 0) Sound.launch();
    else if (m.threat) Sound.alarm();
    else Sound.blip();
  }

  // Fire from a silo that is ready. Returns true on launch.
  function fireSilo(u, target) {
    if (state.defcon > 1 || u.type !== 'silo' || u.mode !== 'launch' || u.switchT > 0 || u.missiles <= 0 || u.cd > 0) return false;
    u.missiles--;
    u.cd = 2.5;
    u.revealed = Infinity; // launches give away the silo
    launchMissile(u.owner, u, target, 'icbm');
    return true;
  }

  const readySilos = (owner) => state.units.filter((o) => o.owner === owner && o.type === 'silo' && o.mode === 'launch' && o.switchT <= 0 && o.missiles > 0 && o.cd <= 0);

  // Every ready silo fires one missile at the target. Returns how many flew.
  function fireSalvo(owner, target) {
    let n = 0;
    for (const s of readySilos(owner)) {
      if (fireSilo(s, { x: target.x + rand(-3, 3), y: target.y + rand(-3, 3) })) n++;
    }
    return n;
  }

  function fireSub(u, target) {
    if (state.defcon > 1 || u.type !== 'sub' || u.missiles <= 0 || u.cd > 0 || dist(u, target) > 280) return false;
    u.missiles--;
    u.cd = 3;
    u.revealed = state.t + 25;
    launchMissile(u.owner, u, target, 'sub');
    return true;
  }

  function launchPlane(base, kind, target) {
    if (base.type !== 'airbase') return false;
    if (kind === 'fighter' && (state.defcon > 4 || base.fighters <= 0)) return false;
    if (kind === 'bomber' && (state.defcon > 1 || base.bombers <= 0 || dist(base, target) > 400)) return false;
    if (kind === 'fighter') base.fighters--;
    else base.bombers--;
    state.units.push({
      id: nextId++, type: kind, air: true, owner: base.owner, x: base.x, y: base.y, base: base.id, dest: { x: target.x, y: target.y },
      fuel: kind === 'fighter' ? 26 : 30, loiter: kind === 'fighter' ? 6 : 0, returning: false, cd: 0, hp: 1, revealed: 0, heading: 0,
    });
    return true;
  }

  function moveUnit(u, pt) {
    if (u.type === 'fleet' || u.type === 'sub') {
      if (isLand(pt) || !seaPath(u, pt)) return false;
      u.dest = { x: pt.x, y: pt.y };
      return true;
    }
    if (u.type === 'army') {
      const r = regionAt(pt);
      if (r !== state.nations[u.owner].region) return false;
      u.dest = { x: pt.x, y: pt.y };
      u.target = null;
      return true;
    }
    return false;
  }

  function invade(u, city) {
    if (u.type !== 'army' || state.defcon > 3 || city.owner === u.owner) return false;
    const home = state.nations[u.owner].region;
    if (city.region !== home && !ADJ[home].includes(city.region)) return false;
    u.target = city.id;
    u.dest = { x: city.x, y: city.y };
    return true;
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function defconAt(t) {
    let d = 5;
    for (const lvl of [5, 4, 3, 2, 1]) if (t >= DEFCON_AT[lvl]) d = lvl;
    return d;
  }

  function onDefcon(d) {
    escalate(`DEFCON ${d}: ${DEFCON_INFO[d].title.toLowerCase()}`, defconColor(d));
    if (simulating) return;
    banner(`DEFCON ${d}`, DEFCON_INFO[d].title, defconColor(d), DEFCON_INFO[d].sub);
    if (d === 1) Sound.siren();
    else Sound.defcon();
  }

  function step(dt) {
    state.t += dt;
    const was = state.defcon;
    state.defcon = defconAt(state.t);
    if (state.defcon !== was) onDefcon(state.defcon);

    for (const n of state.nations) {
      if (!n.alive) continue;
      n.credits += popOf(n.id) * INCOME * dt;
    }

    for (const u of state.units) updateUnit(u, dt);
    updateMissiles(dt);
    state.units = state.units.filter((u) => !u.dead);

    for (const tr of state.tracers) tr.t -= dt;
    state.tracers = state.tracers.filter((tr) => tr.t > 0);
    for (const l of state.log) l.t -= dt;

    for (const n of state.nations) {
      if (n.ai && n.alive) {
        n.ai.think -= dt;
        if (n.ai.think <= 0) {
          n.ai.think = rand(1.2, 2.4);
          aiThink(n);
        }
      }
      n.score = Math.round(n.kills * 2 - n.losses);
      if (n.alive && popOf(n.id) < 3) {
        n.alive = false;
        escalate(`${n.name === 'You' ? 'Your nation has' : `${n.name} has`} fallen`, n.color);
        if (n.id === 0 && !simulating) banner('NATION FALLEN', 'Your government no longer stands', '#f87171');
      }
    }

    if (state.t >= state.rec.nextSnap) snapshot();

    if (!state.over) {
      const alive = state.nations.filter((n) => n.alive);
      const armed = state.missiles.length || state.units.some((u) => (u.type === 'silo' || u.type === 'sub') && u.missiles > 0);
      if (state.t >= END || alive.length <= 1 || (state.defcon === 1 && state.t > DEFCON_AT[1] + 90 && !armed)) {
        state.over = true;
        state.endT = 2.5;
        escalate('Ceasefire', '#e2e8f0');
        if (!simulating) banner('CEASEFIRE', 'The exchange is over', '#e2e8f0');
        Sound.end();
      }
    }
  }

  function enemyOf(a, b) {
    return a !== b;
  }

  function shoot(u, targets, range, chance, onHit, color) {
    let best = null;
    let bd = range;
    for (const t of targets) {
      const d = dist(u, t);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (!best) return false;
    state.tracers.push({ x1: u.x, y1: u.y, x2: best.x, y2: best.y, t: 0.25, color });
    if (u.owner === 0 || best.owner === 0) Sound.gun();
    if (Math.random() < chance) onHit(best);
    return true;
  }

  // A missile shot down in flight.
  function interceptMissile(m) {
    m.dead = true;
    m.rec.te = state.t;
    if (!simulating) {
      fx.booms.push({ x: m.x, y: m.y, at: fx.now, kind: 'icpt' });
      Sound.intercept();
    }
  }

  function updateUnit(u, dt) {
    u.cd -= dt;
    const war = state.defcon <= 3;
    const color = state.nations[u.owner].color;
    const enemyMissiles = () => state.missiles.filter((m) => enemyOf(m.owner, u.owner) && !m.dead);
    const enemyPlanes = () => state.units.filter((o) => o.air && !o.dead && enemyOf(o.owner, u.owner));

    if (u.type === 'silo') {
      if (u.switchT > 0) {
        u.switchT -= dt;
        if (u.switchT <= 0) u.mode = u.nextMode;
        return;
      }
      if (u.mode === 'defend' && war && u.cd <= 0) {
        if (shoot(u, enemyMissiles(), 150, 0.3, interceptMissile, color)) u.cd = 1.2;
        else if (shoot(u, enemyPlanes(), 140, 0.4, kill, color)) u.cd = 1.2;
      }
    } else if (u.type === 'radar') {
      u.sweep = (u.sweep || 0) + dt * 2;
    } else if (u.type === 'satellite') {
      u.phase = (u.phase + UNITS.satellite.speed * dt) % W;
      u.x = u.phase;
      u.y = u.y0 + Math.sin((u.phase / W) * Math.PI * 4) * u.amp;
    } else if (u.type === 'fleet' || u.type === 'sub' || u.type === 'army') {
      moveToward(u, UNITS[u.type].speed, dt);
      if (u.type === 'fleet' && war && u.cd <= 0) {
        const ships = state.units.filter((o) => !o.dead && enemyOf(o.owner, u.owner) && (o.type === 'fleet' || (o.type === 'sub' && dist(u, o) < 45)));
        if (shoot(u, ships, 75, 0.5, (o) => { o.hp -= 3; if (o.hp <= 0) kill(o); }, color)) u.cd = 1;
        else if (shoot(u, enemyMissiles(), 60, 0.18, interceptMissile, color)) u.cd = 0.8;
        else if (shoot(u, enemyPlanes(), 65, 0.3, kill, color)) u.cd = 0.8;
      }
      if (u.type === 'sub' && war && u.cd <= 0 && u.revealed > state.t) {
        const ships = state.units.filter((o) => !o.dead && enemyOf(o.owner, u.owner) && o.type === 'fleet');
        if (shoot(u, ships, 40, 0.4, (o) => { o.hp -= 4; if (o.hp <= 0) kill(o); }, color)) u.cd = 1.5;
      }
      if (u.type === 'army') updateArmy(u, dt);
    } else if (u.air) {
      updatePlane(u, dt);
    }
  }

  function moveToward(u, speed, dt) {
    if (!u.dest) return;
    const d = dist(u, u.dest);
    if (d < 1) {
      u.dest = u.type === 'army' && u.target ? u.dest : null;
      return;
    }
    const s = Math.min(d, speed * dt);
    u.x += ((u.dest.x - u.x) / d) * s;
    u.y += ((u.dest.y - u.y) / d) * s;
    u.heading = Math.atan2(u.dest.y - u.y, u.dest.x - u.x);
  }

  function updateArmy(u, dt) {
    if (!u.target) return;
    const city = state.cities.find((c) => c.id === u.target);
    if (!city || city.owner === u.owner) {
      u.target = null;
      u.dest = null;
      return;
    }
    if (dist(u, city) > 6 || state.defcon > 3) return;
    // Siege: the city garrison and nearby defending armies fight back.
    const defenders = state.units.filter((o) => o.type === 'army' && o.owner === city.owner && dist(o, city) < 40);
    const defStr = city.garrison + defenders.reduce((s, o) => s + o.str, 0);
    const lossA = defStr * 0.12 * dt * rand(0.6, 1.4);
    const lossD = u.str * 0.14 * dt * rand(0.6, 1.4);
    u.str -= lossA;
    let rest = lossD;
    const g = Math.min(city.garrison, rest);
    city.garrison -= g;
    rest -= g;
    for (const o of defenders) {
      if (rest <= 0) break;
      const k = Math.min(o.str, rest);
      o.str -= k;
      rest -= k;
      if (o.str <= 0.5) kill(o);
    }
    if (Math.random() < dt * 2) state.tracers.push({ x1: u.x + rand(-6, 6), y1: u.y + rand(-6, 6), x2: city.x + rand(-6, 6), y2: city.y + rand(-6, 6), t: 0.2, color: state.nations[u.owner].color });
    if (u.str <= 0.5) {
      kill(u);
      return;
    }
    if (city.garrison <= 0.1 && defenders.every((o) => o.dead)) {
      const before = state.nations[city.owner];
      const winner = state.nations[u.owner];
      // Fighting in the streets costs lives.
      const killed = city.pop * 0.3;
      city.pop -= killed;
      before.losses += killed;
      winner.kills += killed;
      city.owner = u.owner;
      city.garrison = u.str;
      u.dead = true;
      state.rec.marks.push({ t: state.t, kind: 'cap', x: city.x, y: city.y, o: u.owner });
      escalate(`${winner.name} captured ${city.name} from ${before.name}`, winner.color);
      if (!simulating) fx.booms.push({ x: city.x, y: city.y, at: fx.now, kind: 'cap', color: winner.color });
    }
  }

  function updatePlane(p, dt) {
    const base = state.units.find((u) => u.id === p.base && !u.dead);
    const speed = p.type === 'fighter' ? 80 : 50;
    p.fuel -= dt;
    let dest = p.returning ? base : p.dest;
    if (!dest) {
      if (p.fuel <= 0) p.dead = true;
      dest = p.dest;
    }
    const d = dist(p, dest);
    if (d < 3) {
      if (p.returning) {
        if (base) {
          if (p.type === 'fighter') base.fighters++;
          else base.bombers++;
        }
        p.dead = true;
        return;
      }
      if (p.type === 'bomber' && !p.dropped) {
        p.dropped = true;
        detonate(p.x, p.y, p.owner);
        p.returning = true;
      } else if (p.type === 'fighter') {
        p.loiter -= dt;
        if (p.loiter <= 0) p.returning = true;
      }
    } else {
      const s = Math.min(d, speed * dt);
      p.x += ((dest.x - p.x) / d) * s;
      p.y += ((dest.y - p.y) / d) * s;
      p.heading = Math.atan2(dest.y - p.y, dest.x - p.x);
    }
    if (!p.returning && base && p.fuel < dist(p, base) / speed + 1) p.returning = true;
    if (p.fuel <= -5) p.dead = true;
    if (p.type === 'fighter' && state.defcon <= 3 && p.cd <= 0) {
      const planes = state.units.filter((o) => o.air && !o.dead && enemyOf(o.owner, p.owner));
      if (shoot(p, planes, 45, 0.35, kill, state.nations[p.owner].color)) p.cd = 1;
    }
  }

  function kill(u) {
    if (u.dead) return;
    u.dead = true;
    if (!simulating) fx.booms.push({ x: u.x, y: u.y, at: fx.now, kind: 'small' });
    if (u.owner === 0) log(`Your ${UNITS[u.type] ? UNITS[u.type].name.toLowerCase() : u.type} was destroyed`, '#f87171');
  }

  function updateMissiles(dt) {
    for (const m of state.missiles) {
      if (m.dead) continue;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const p = bez(m, k);
      m.x = p.x;
      m.y = p.y;
      // Sample the trail by game time so it looks the same at any speed.
      m.trailT -= dt;
      if (m.trailT <= 0) {
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 36) m.trail.shift();
        m.trailT = 0.12;
      }
      if (k >= 1) {
        m.dead = true;
        m.rec.te = state.t;
        m.rec.hit = true;
        detonate(m.tx, m.ty, m.owner);
      }
    }
    state.missiles = state.missiles.filter((m) => !m.dead);
  }

  function detonate(x, y, owner) {
    state.craters.push({ x, y, t: state.t });
    state.rec.blasts.push({ t: state.t, x, y, o: owner });
    if (!simulating) nukeFx(x, y);
    const attacker = state.nations[owner];
    const R = BLAST * 1.4;
    for (const c of state.cities) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > R || c.pop <= 0) continue;
      const frac = 0.08 + 0.55 * (1 - d / R);
      const killed = c.pop * frac;
      c.pop -= killed;
      c.garrison *= 0.5;
      const victim = state.nations[c.owner];
      victim.losses += killed;
      if (victim.id !== owner) {
        attacker.kills += killed;
        if (victim.ai) victim.ai.grudge[owner] = (victim.ai.grudge[owner] || 0) + killed;
      }
      if (killed >= 5) escalate(`${c.name} struck by ${attacker.name}: ${killed.toFixed(1)}M dead`, victim.id === 0 ? '#f87171' : attacker.color);
      else if (killed > 0.5) log(`${c.name} hit: ${killed.toFixed(1)}M dead`, victim.id === 0 ? '#f87171' : attacker.color);
    }
    for (const u of state.units) {
      if (u.dead || u.type === 'satellite') continue;
      if (Math.hypot(u.x - x, u.y - y) < BLAST) kill(u);
    }
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  function randomSpot(n, type) {
    const R = REGIONS[n.region];
    const xs = R.shapes.flat().map((p) => p.x);
    const ys = R.shapes.flat().map((p) => p.y);
    const box = { x0: Math.min(...xs) - 50, x1: Math.max(...xs) + 50, y0: Math.min(...ys) - 50, y1: Math.max(...ys) + 50 };
    for (let k = 0; k < 200; k++) {
      let p;
      if (type === 'army') {
        const c = pick(state.cities.filter((c) => c.owner === n.id));
        if (!c) return null;
        p = { x: c.x + rand(-18, 18), y: c.y + rand(-18, 18) };
      } else {
        p = { x: rand(box.x0, box.x1), y: rand(box.y0, box.y1) };
      }
      if (type === 'satellite') return p;
      if (type === 'radar' && distToShapes(p, R.shapes) > 30) continue;
      if (type === 'silo' && k < 80 && state.cities.some((c) => c.owner === n.id && dist(c, p) < 16)) continue;
      if (canPlace(n.id, type, p)) return p;
    }
    return null;
  }

  // Send a ship to a spot at sea about r px from a point.
  function sailNear(f, target, r0, r1) {
    for (let k = 0; k < 25; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(r0, r1);
      const p = { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r };
      if (p.x < 5 || p.x > W - 5 || p.y < 50 || p.y > H - 10) continue;
      if (moveUnit(f, p)) return true;
    }
    return false;
  }

  function aiThink(n) {
    const P = PERSONAS[n.ai.persona] || PERSONAS.aggressive;
    const own = state.units.filter((u) => u.owner === n.id);
    const count = (t) => own.filter((u) => u.type === t).length;

    // Build toward the personality's wish list; past it, extras.
    for (let guard = 0; guard < 4; guard++) {
      let best = null;
      let bestK = Infinity;
      for (const [t, want] of Object.entries(P.want)) {
        if (!want) continue;
        const k = (count(t) + rand(0, 0.6)) / want;
        if (k < bestK && n.credits >= UNITS[t].cost) {
          bestK = k;
          best = t;
        }
      }
      if (!best) break;
      if (bestK >= 1) {
        if (Math.random() < 0.5) break;
        best = pick(P.extra);
        if (n.credits < UNITS[best].cost) break;
      }
      const spot = randomSpot(n, best);
      const u = spot && build(n.id, best, spot);
      if (!u) {
        n.ai.failed = (n.ai.failed || 0) + 1;
        break;
      }
      own.push(u);
    }

    const enemies = state.nations.filter((o) => o.id !== n.id && o.alive);
    if (!enemies.length) return;
    // Main enemy: whoever hurt us most, otherwise a neighbour.
    let foe = null;
    let worst = 0;
    for (const e of enemies) {
      const g = n.ai.grudge[e.id] || 0;
      if (g > worst) { worst = g; foe = e; }
    }
    if (!foe) {
      if (n.ai.foe == null || !state.nations[n.ai.foe].alive) {
        const near = enemies.filter((e) => ADJ[n.region].includes(e.region));
        n.ai.foe = pick(near.length ? near : enemies).id;
      }
      foe = state.nations[n.ai.foe];
    }

    if (state.defcon <= 4) {
      // Scout with fighters now and then.
      for (const b of own.filter((u) => u.type === 'airbase')) {
        if (b.fighters > 1 && Math.random() < 0.12) {
          const c = pick(state.cities.filter((c) => c.owner === foe.id));
          if (c) launchPlane(b, 'fighter', { x: c.x + rand(-40, 40), y: c.y + rand(-40, 40) });
        }
      }
    }

    if (state.defcon <= 3) {
      for (const f of own.filter((u) => u.type === 'fleet' || u.type === 'sub')) {
        if (f.dest || Math.random() > 0.3) continue;
        if (f.type === 'fleet' && n.ai.persona === 'defensive' && Math.random() < 0.6) {
          // Defensive fleets patrol their own coast.
          const home = pick(state.cities.filter((c) => c.owner === n.id));
          if (home) sailNear(f, home, 30, 80);
          continue;
        }
        const target = pick(state.cities.filter((c) => c.owner === foe.id));
        if (!target) continue;
        if (f.type === 'sub') sailNear(f, target, n.ai.persona === 'sneaky' ? 110 : 90, n.ai.persona === 'sneaky' ? 230 : 200);
        else sailNear(f, target, 50, 120);
      }
      // Armies invade a weakly held neighbouring city.
      for (const a of own.filter((u) => u.type === 'army' && !u.target && u.str > 7)) {
        if (Math.random() > P.invade) continue;
        const targets = state.cities.filter((c) => c.owner !== n.id && (ADJ[n.region].includes(c.region) || c.region === n.region));
        targets.sort((p, q) => defence(p) + dist(a, p) / 40 - (defence(q) + dist(a, q) / 40));
        if (targets[0] && defence(targets[0]) < a.str * P.odds) invade(a, targets[0]);
      }
    }

    if (state.defcon === 1) {
      const since = state.t - DEFCON_AT[1];
      const silos = own.filter((u) => u.type === 'silo');
      if (!n.ai.launched && since > n.ai.nukeAt) {
        n.ai.launched = true;
        // Keep some silos on defence.
        const keep = Math.max(1, Math.floor(silos.length * P.keep));
        silos.slice(keep).forEach((s) => setSiloMode(s, 'launch'));
      }
      // Retaliate: if we are being hit, switch everything to launch.
      if (worst > P.retaliate) silos.forEach((s) => s.missiles > 0 && setSiloMode(s, 'launch'));
      const targets = nukeTargets(n, foe);
      for (const s of silos) {
        if (s.mode === 'launch' && s.missiles > 0 && s.cd <= 0 && targets.length) fireSilo(s, pickTarget(targets));
        if (s.mode === 'launch' && s.missiles === 0) setSiloMode(s, 'defend');
      }
      // Subs wait for the launch order unless the sneaky ones strike early.
      if (n.ai.launched || n.ai.persona === 'sneaky' || worst > P.retaliate) {
        for (const s of own.filter((u) => u.type === 'sub' && u.missiles > 0 && u.cd <= 0)) {
          const inRange = targets.filter((t) => dist(s, t) < 270);
          if (inRange.length) fireSub(s, pickTarget(inRange));
        }
      }
      for (const b of own.filter((u) => u.type === 'airbase' && u.bombers > 0)) {
        const inRange = targets.filter((t) => dist(b, t) < 380);
        if (inRange.length && Math.random() < P.bomb) launchPlane(b, 'bomber', pickTarget(inRange));
      }
    }
  }

  function defence(city) {
    return city.garrison + state.units.filter((o) => o.type === 'army' && o.owner === city.owner && dist(o, city) < 40).reduce((s, o) => s + o.str, 0);
  }

  // Cities (by population) and known military targets of the foe.
  function nukeTargets(n, foe) {
    const out = [];
    for (const c of state.cities) {
      if (c.owner !== foe.id || c.pop < 1) continue;
      out.push({ x: c.x + rand(-4, 4), y: c.y + rand(-4, 4), w: c.pop });
    }
    for (const u of state.units) {
      if (u.owner !== foe.id || u.dead || !BUILDINGS.includes(u.type)) continue;
      if (!visibleUnit(n.id, u)) continue;
      out.push({ x: u.x, y: u.y, w: u.type === 'silo' ? 8 : 3 });
    }
    return out;
  }

  function pickTarget(list) {
    let total = 0;
    for (const t of list) total += t.w;
    let r = Math.random() * total;
    for (const t of list) {
      r -= t.w;
      if (r <= 0) return t;
    }
    return list[0];
  }

  // ---------------------------------------------------------------------------
  // Canvas and camera
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const PI2 = Math.PI * 2;
  let background = null; // the map pre-rendered for the current view
  let bgKey = '';
  let landDots = null; // halftone dots that fill each continent
  let iconK = 1; // icons grow a little, not fully, when zoomed in
  let hudHidden = false; // test hook for clean screenshots

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
    background = null;
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  // The camera: zoom z (1 to ZOOM_MAX) and the world point at the top-left
  // of the view. `cam` eases toward `camGoal`; drags move both at once.
  const cam = { x: 0, y: 0, z: 1 };
  const camGoal = { x: 0, y: 0, z: 1 };

  function clampView(c) {
    c.z = clamp(c.z, 1, ZOOM_MAX);
    c.x = clamp(c.x, 0, W - W / c.z);
    c.y = clamp(c.y, 0, H - H / c.z);
  }

  const toWorld = (p) => ({ x: p.x / cam.z + cam.x, y: p.y / cam.z + cam.y });
  const toScreen = (p) => ({ x: (p.x - cam.x) * cam.z, y: (p.y - cam.y) * cam.z });

  // Zoom toward a screen point, keeping the world point under it in place.
  function zoomAt(sx, sy, z, instant = false) {
    const g = camGoal;
    const wx = sx / g.z + g.x;
    const wy = sy / g.z + g.y;
    g.z = clamp(z, 1, ZOOM_MAX);
    g.x = wx - sx / g.z;
    g.y = wy - sy / g.z;
    clampView(g);
    if (instant) Object.assign(cam, g);
  }

  // Pan by a distance in screen units.
  function panBy(dx, dy) {
    cam.x -= dx / cam.z;
    cam.y -= dy / cam.z;
    clampView(cam);
    Object.assign(camGoal, cam);
  }

  function resetView(instant = false) {
    Object.assign(camGoal, { x: 0, y: 0, z: 1 });
    if (instant) Object.assign(cam, camGoal);
  }

  // Centre a world point when zoomed in.
  function focusOn(p) {
    if (camGoal.z <= 1.01) return;
    camGoal.x = p.x - W / 2 / camGoal.z;
    camGoal.y = p.y - H / 2 / camGoal.z;
    clampView(camGoal);
  }

  function updateCamera(real) {
    const k = 1 - Math.exp(-real * 14);
    for (const key of ['x', 'y', 'z']) {
      cam[key] += (camGoal[key] - cam[key]) * k;
      if (Math.abs(camGoal[key] - cam[key]) < 0.0005) cam[key] = camGoal[key];
    }
    clampView(cam);
    iconK = 1 / Math.sqrt(cam.z);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  const defconColor = (d) => ['#fff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8'][d];

  const glowCache = new Map();
  function glow(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color);
      grad.addColorStop(0.35, color.startsWith('#') ? rgba(color, 0.45) : color.replace(/[\d.]+\)$/, (a) => `${Number.parseFloat(a) * 0.45})`));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }

  function drawGlow(x, y, r, color, g = ctx) {
    g.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  }

  // Edge vignettes (dark corners, and a red pulse for alerts), drawn small
  // and stretched since they are smooth gradients.
  const vignettes = {};
  function vignette(color, inner) {
    const key = color + inner;
    if (!vignettes[key]) {
      const c = document.createElement('canvas');
      c.width = 250;
      c.height = 140;
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 140 / 250, 0, 0);
      const grad = g.createRadialGradient(125, 125, 125 * inner, 125, 125, 160);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.fillRect(0, 0, 250, 250);
      vignettes[key] = c;
    }
    return vignettes[key];
  }

  // Dots on a staggered grid inside every continent, grouped by colour.
  function makeLandDots() {
    const out = new Map();
    for (let y = 42; y < H; y += 5) {
      for (let x = (Math.round(y / 5) & 1) * 2.5; x < W; x += 5) {
        const p = { x, y };
        const r = regionAt(p);
        let color = null;
        if (r) {
          const n = nationOf(r);
          color = n ? n.color : '#64748b';
        } else if (WILD.some((s) => inPoly(p, s))) color = '#64748b';
        if (!color) continue;
        if (!out.has(color)) out.set(color, []);
        out.get(color).push(x, y);
      }
    }
    return out;
  }

  // Ocean, grid and continents for the current view, at the canvas's real
  // resolution. Redrawn only when the view or canvas size changes.
  function makeBackground() {
    const scale = canvas.width / W;
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const sea = g.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, W * 0.72);
    sea.addColorStop(0, '#081a33');
    sea.addColorStop(1, '#01040b');
    g.fillStyle = sea;
    g.fillRect(0, 0, W, H);

    const z = cam.z;
    const px = 1 / z; // one screen unit in world units
    g.setTransform(scale * z, 0, 0, scale * z, -cam.x * z * scale, -cam.y * z * scale);
    const gridLine = (stepDeg, alpha) => {
      g.strokeStyle = `rgba(56,189,248,${alpha})`;
      g.lineWidth = px;
      g.beginPath();
      for (let lon = -160; lon <= 180; lon += stepDeg) {
        const x = proj([lon, 0]).x;
        g.moveTo(x, 40);
        g.lineTo(x, H);
      }
      for (let lat = -60; lat <= 80; lat += stepDeg) {
        const y = proj([0, lat]).y;
        g.moveTo(0, y);
        g.lineTo(W, y);
      }
      g.stroke();
    };
    if (z > 1.5) gridLine(10, 0.035);
    gridLine(20, 0.08);
    // The equator and tropics, faintly dashed.
    g.setLineDash([4 * px, 6 * px]);
    g.strokeStyle = 'rgba(56,189,248,0.12)';
    g.beginPath();
    for (const lat of [0, 23.4, -23.4]) {
      const y = proj([0, lat]).y;
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    g.setLineDash([]);

    if (!landDots) landDots = makeLandDots();
    const fillShapes = (shapes, fill) => {
      g.fillStyle = fill;
      for (const s of shapes) {
        g.beginPath();
        s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fill();
      }
    };
    const strokeShapes = (shapes, color) => {
      g.lineJoin = 'round';
      for (const [w, a] of [[9, 0.07], [4.5, 0.18], [1.4, 0.95]]) {
        g.strokeStyle = rgba(color, a);
        g.lineWidth = w * px;
        for (const s of shapes) {
          g.beginPath();
          s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
          g.stroke();
        }
      }
    };
    fillShapes(WILD, 'rgba(100,116,139,0.06)');
    for (const id of REGION_IDS) {
      const n = nationOf(id);
      fillShapes(REGIONS[id].shapes, n ? rgba(n.color, n.id === 0 ? 0.1 : 0.06) : 'rgba(100,116,139,0.05)');
    }
    const d = 1.15 / Math.sqrt(z);
    for (const [color, pts] of landDots) {
      g.fillStyle = rgba(color, color === NATIONS[0].color ? 0.32 : 0.22);
      for (let i = 0; i < pts.length; i += 2) g.fillRect(pts[i] - d / 2, pts[i + 1] - d / 2, d, d);
    }
    strokeShapes(WILD, '#64748b');
    for (const id of REGION_IDS) {
      const n = nationOf(id);
      strokeShapes(REGIONS[id].shapes, n ? n.color : '#64748b');
    }
    return c;
  }

  // ---------------------------------------------------------------------------
  // Effects (real time, so they look the same at any game speed)
  // ---------------------------------------------------------------------------

  const fx = { now: 0, booms: [], pings: [], shake: 0, flash: 0, lastFlash: -1, banner: null, red: 0 };

  function banner(title, sub, color, detail = '') {
    fx.banner = { title, sub, color, detail, at: fx.now };
  }

  function nukeFx(x, y) {
    fx.booms.push({ x, y, at: fx.now, kind: 'nuke', seed: Math.random() * 10 });
    // Shake and flash scale with how close it is to what you're looking at.
    const s = toScreen({ x, y });
    const onScreen = s.x > -40 && s.x < W + 40 && s.y > 0 && s.y < H + 40;
    const mine = state.cities.some((c) => c.owner === 0 && Math.hypot(c.x - x, c.y - y) < BLAST * 1.6);
    const near = mine ? 1 : onScreen ? 0.55 : 0.2;
    if (!REDUCED) fx.shake = Math.min(9, fx.shake + 5 * near * (0.7 + cam.z * 0.25));
    if (onScreen && fx.now - fx.lastFlash > 0.35) {
      fx.flash = Math.max(fx.flash, REDUCED ? 0.1 : 0.12 + 0.25 * near);
      fx.lastFlash = fx.now;
    }
    Sound.boom(near);
  }

  const BOOM_LIFE = { nuke: 6, icpt: 0.7, small: 0.8, cap: 1.6 };

  function drawNuke(b, age) {
    const { x, y } = b;
    const R = BLAST;
    const seed = b.seed ?? b.x;
    ctx.globalCompositeOperation = 'lighter';
    // White-hot flash.
    if (age < 0.5) {
      const k = age / 0.5;
      ctx.globalAlpha = 1 - k;
      drawGlow(x, y, R * (1 + k * 2.4), '#ffffff');
    }
    // Fireball cooling from white to orange.
    const fb = clamp(1 - age / 3.4, 0, 1);
    if (fb > 0) {
      ctx.globalAlpha = fb * 0.9;
      drawGlow(x, y, R * (0.7 + 0.5 * (1 - fb)), age < 0.9 ? '#fff7ed' : '#fb923c');
      ctx.globalAlpha = fb * 0.6;
      drawGlow(x, y, R * 1.7, 'rgba(239,68,68,0.6)');
    }
    // Shockwave rings.
    for (const lag of [0, 0.18]) {
      const k = (age - lag) / 1.8;
      if (k < 0 || k > 1) continue;
      ctx.globalAlpha = (1 - k) * (lag ? 0.4 : 0.9);
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = (2.4 * (1 - k) + 0.4) * iconK;
      ctx.beginPath();
      ctx.arc(x, y, R * (0.3 + k * 2.3), 0, PI2);
      ctx.stroke();
    }
    // Rising cloud: the stem and cap climb, then cool into smoke.
    const rise = 1 - Math.pow(1 - clamp(age / 2.6, 0, 1), 3);
    const top = y - R * 1.45 * rise;
    const fade = clamp(1 - (age - 2.4) / 3.6, 0, 1);
    if (fade > 0 && age > 0.12) {
      const hot = clamp(1 - age / 2.2, 0, 1);
      ctx.globalAlpha = 0.35 * fade;
      for (let k = 0; k <= 6; k++) {
        const yy = y + (top - y) * (k / 6);
        drawGlow(x + Math.sin(k * 1.7 + seed) * 0.8, yy, R * (0.2 + 0.035 * k), hot > 0.3 ? '#fdba74' : '#c2410c');
      }
      const capR = R * (0.38 + 0.34 * rise);
      ctx.globalAlpha = 0.75 * fade;
      drawGlow(x, top, capR, hot > 0.4 ? '#fef3c7' : '#f97316');
      ctx.globalAlpha = 0.55 * fade;
      drawGlow(x - capR * 0.62, top + capR * 0.18, capR * 0.72, '#ea580c');
      drawGlow(x + capR * 0.62, top + capR * 0.18, capR * 0.72, '#ea580c');
      // A ring of cloud around the stem.
      ctx.globalAlpha = 0.3 * fade;
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.2 * iconK;
      ctx.beginPath();
      ctx.ellipse(x, y + (top - y) * 0.45, capR * 0.55, capR * 0.16, 0, 0, PI2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // A missile shot down: a bright star burst.
  function drawIntercept(x, y, age) {
    const k = age / BOOM_LIFE.icpt;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    drawGlow(x, y, (6 + k * 10) * iconK, '#ffffff');
    drawGlow(x, y, (12 + k * 8) * iconK, 'rgba(56,189,248,0.6)');
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1 * iconK;
    const s = (4 + k * 10) * iconK;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 4) * 2 + Math.PI / 4;
      ctx.moveTo(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3);
      ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFx(now) {
    for (const b of fx.booms) {
      const age = now - b.at;
      if (b.kind === 'nuke') drawNuke(b, age);
      else if (b.kind === 'icpt') drawIntercept(b.x, b.y, age);
      else if (b.kind === 'small') {
        const k = age / BOOM_LIFE.small;
        ctx.globalAlpha = 1 - k;
        drawGlow(b.x, b.y, (6 + k * 8) * iconK, '#fde68a');
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = iconK;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10 * k * iconK, 0, PI2);
        ctx.stroke();
      } else if (b.kind === 'cap') {
        const k = age / BOOM_LIFE.cap;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2 * iconK;
        ctx.beginPath();
        ctx.arc(b.x, b.y, (8 + k * 26) * iconK, 0, PI2);
        ctx.stroke();
      }
    }
    // Build confirmation pings.
    for (const p of fx.pings) {
      const k = (now - p.at) / 0.6;
      if (k > 1) continue;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 * iconK;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (6 + k * 18) * iconK, 0, PI2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Rendering: the world
  // ---------------------------------------------------------------------------

  // Unit icons are drawn around the origin, then placed and scaled.
  function drawUnitIcon(u, color, alpha = 1, scale = iconK) {
    const x = 0;
    const y = 0;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    if (u.type === 'silo') {
      const launch = u.mode === 'launch';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, PI2);
      if (launch) {
        ctx.fillStyle = rgba('#ef4444', 0.45);
        ctx.fill();
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - 3.5);
      ctx.lineTo(x + 3, y + 2.5);
      ctx.lineTo(x - 3, y + 2.5);
      ctx.closePath();
      ctx.fill();
      if (u.switchT > 0) {
        ctx.beginPath();
        ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + (1 - u.switchT / 8) * PI2);
        ctx.stroke();
      }
    } else if (u.type === 'radar') {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, PI2);
      ctx.stroke();
      const a = u.sweep || 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
      ctx.stroke();
    } else if (u.type === 'airbase') {
      ctx.strokeRect(x - 6, y - 5, 12, 10);
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 3);
      ctx.lineTo(x + 4, y - 3);
      ctx.stroke();
    } else if (u.type === 'army') {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.stroke();
    } else if (u.type === 'fleet') {
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 2);
      ctx.lineTo(x + 7, y - 2);
      ctx.lineTo(x + 4, y + 3);
      ctx.lineTo(x - 4, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 1.5, y - 5, 3, 3);
    } else if (u.type === 'sub') {
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 3, 0, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillRect(x - 1, y - 5, 2, 3);
    } else if (u.type === 'satellite') {
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x - 3, y);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 9, y);
      ctx.stroke();
      ctx.strokeRect(x - 11, y - 2, 4, 4);
      ctx.strokeRect(x + 7, y - 2, 4, 4);
    } else if (u.air) {
      const s = u.type === 'bomber' ? 7 : 5;
      ctx.rotate(u.heading || 0);
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s, -s * 0.8);
      ctx.lineTo(-s * 0.5, 0);
      ctx.lineTo(-s, s * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Fallout glows where nukes landed and fades slowly over game time.
  function drawFallout(list, t) {
    for (const c of list) {
      const age = t - c.t;
      const a = 0.12 + 0.3 * Math.exp(-age / 40);
      ctx.globalAlpha = a;
      drawGlow(c.x, c.y, BLAST * 1.35, '#ea580c');
      ctx.globalAlpha = a * 0.9;
      drawGlow(c.x, c.y, BLAST * 0.5, '#facc15');
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(251,146,60,0.22)';
    ctx.lineWidth = 0.7 * iconK;
    ctx.setLineDash([1.5 * iconK, 3 * iconK]);
    ctx.beginPath();
    for (const c of list) {
      ctx.moveTo(c.x + BLAST, c.y);
      ctx.arc(c.x, c.y, BLAST, 0, PI2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // A city is a cluster of lights that go dark as its people die.
  function drawCity(c, pop, owner, now) {
    const col = state.nations[owner].color;
    const life = clamp(pop / c.pop0, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    if (life > 0.02) {
      ctx.globalAlpha = 0.2 + 0.55 * life;
      drawGlow(c.x, c.y, (5 + Math.sqrt(c.pop0) * 2.6) * (0.45 + 0.55 * life), rgba(col, 0.6));
    }
    const s0 = 1.15 * iconK;
    for (const l of c.lights) {
      const lit = life > l.th;
      if (!lit) continue;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now * 2.5 + l.th * 50);
      ctx.fillStyle = l.th < 0.2 ? '#ffffff' : col;
      const s = l.s * s0;
      ctx.fillRect(c.x + l.dx - s / 2, c.y + l.dy - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Dark embers where lights went out.
    ctx.fillStyle = '#334155';
    ctx.globalAlpha = 0.7;
    for (const l of c.lights) {
      if (life > l.th) continue;
      const s = l.s * s0 * 0.9;
      ctx.fillRect(c.x + l.dx - s / 2, c.y + l.dy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawCityLabels(list) {
    ctx.textAlign = 'center';
    const fs = 9 * iconK;
    ctx.font = `${fs}px system-ui, sans-serif`;
    for (const { c, pop, owner } of list) {
      if (!(c.pop0 >= 6 || cam.z > 1.6 || c === hoverCity)) continue;
      const dead = pop < 0.3;
      ctx.fillStyle = dead ? 'rgba(100,116,139,0.8)' : rgba(state.nations[owner].color, 0.8);
      const y = c.y + (3 + Math.sqrt(c.pop0) * 1.2 + 6) * Math.max(iconK, 0.75);
      ctx.fillText(c.name, c.x, y);
      if (cam.z > 1.6) {
        ctx.fillStyle = 'rgba(148,163,184,0.75)';
        ctx.font = `${fs * 0.85}px system-ui, sans-serif`;
        ctx.fillText(`${pop.toFixed(1)}M`, c.x, y + fs);
        ctx.font = `${fs}px system-ui, sans-serif`;
      }
    }
  }

  // A glowing missile trail (oldest point first) with a bright head.
  function drawMissile(pts, col) {
    const n = pts.length;
    if (!n) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a = i / n;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = rgba(col, 0.1 * a);
      ctx.lineWidth = 5 * iconK;
      ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.85 * a);
      ctx.lineWidth = 1.3 * iconK;
      ctx.stroke();
    }
    const h = pts[n - 1];
    drawGlow(h.x, h.y, 11 * iconK, rgba(col, 0.9));
    drawGlow(h.x, h.y, 5 * iconK, '#ffffff');
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  // Incoming: a red predicted path, and a target ring that closes like a clock.
  function drawThreat(m, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 8);
    ctx.strokeStyle = `rgba(248,113,113,${0.35 + 0.35 * pulse})`;
    ctx.lineWidth = 1.2 * iconK;
    ctx.setLineDash([3 * iconK, 4 * iconK]);
    ctx.lineDashOffset = -now * 20 * iconK;
    ctx.beginPath();
    const k0 = Math.min(1, m.t / m.dur);
    for (let i = 0; i <= 16; i++) {
      const p = bez(m, k0 + ((1 - k0) * i) / 16);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    const R = BLAST * 1.1;
    ctx.globalAlpha = 0.45 + 0.4 * pulse;
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(m.tx, m.ty, R, -Math.PI / 2, -Math.PI / 2 + (1 - k0) * PI2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + now;
      ctx.moveTo(m.tx + Math.cos(a) * R * 0.55, m.ty + Math.sin(a) * R * 0.55);
      ctx.lineTo(m.tx + Math.cos(a) * R * 0.85, m.ty + Math.sin(a) * R * 0.85);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawWorld(now) {
    drawFallout(state.craters, state.t);

    // Your radar and satellite coverage, with a sweeping radar beam.
    for (const u of state.units) {
      if (u.owner !== 0 || (u.type !== 'radar' && u.type !== 'satellite')) continue;
      const r = UNITS[u.type].vision;
      ctx.lineWidth = iconK;
      ctx.strokeStyle = 'rgba(56,189,248,0.2)';
      ctx.fillStyle = 'rgba(56,189,248,0.03)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, r, 0, PI2);
      ctx.fill();
      ctx.stroke();
      if (u.type === 'radar') {
        const a = u.sweep || 0;
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = `rgba(56,189,248,${0.06 * (1 - i / 8)})`;
          ctx.beginPath();
          ctx.moveTo(u.x, u.y);
          ctx.arc(u.x, u.y, r, a - (i + 1) * 0.06, a - i * 0.06);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    const cityList = state.cities.map((c) => ({ c, pop: c.pop, owner: c.owner }));
    for (const it of cityList) drawCity(it.c, it.pop, it.owner, now);
    drawCityLabels(cityList);

    // Units you can see.
    for (const u of state.units) {
      if (!visibleUnit(0, u)) continue;
      const col = state.nations[u.owner].color;
      if (u.owner === 0 && u.dest && (u.type === 'fleet' || u.type === 'sub' || u.type === 'army')) {
        ctx.strokeStyle = 'rgba(56,189,248,0.45)';
        ctx.lineWidth = iconK;
        ctx.setLineDash([2 * iconK, 4 * iconK]);
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(u.dest.x, u.dest.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (u.type === 'silo' && u.mode === 'launch') {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 4 + u.id);
        drawGlow(u.x, u.y, 16 * iconK, 'rgba(239,68,68,0.6)');
        ctx.globalAlpha = 1;
      } else if (u.owner === 0 && !u.air) {
        ctx.globalAlpha = 0.5;
        drawGlow(u.x, u.y, 12 * iconK, 'rgba(56,189,248,0.35)');
        ctx.globalAlpha = 1;
      }
      drawUnitIcon(u, col, u.owner === 0 || u.revealed > state.t || u.type === 'satellite' ? 1 : 0.85);
      if (state.selected === u) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2 * iconK;
        ctx.setLineDash([3 * iconK, 3 * iconK]);
        ctx.lineDashOffset = -now * 8;
        ctx.beginPath();
        ctx.arc(u.x, u.y, 12 * iconK, 0, PI2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
    }

    // Gunfire.
    for (const tr of state.tracers) {
      ctx.globalAlpha = clamp(tr.t * 4, 0, 1);
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = iconK;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Missiles: faint predicted paths, warnings for yours, then trails.
    for (const m of state.missiles) {
      if (m.threat) {
        drawThreat(m, now);
        continue;
      }
      ctx.strokeStyle = rgba(state.nations[m.owner].color, 0.13);
      ctx.lineWidth = iconK;
      ctx.setLineDash([2 * iconK, 5 * iconK]);
      ctx.beginPath();
      const k0 = Math.min(1, m.t / m.dur);
      for (let i = 0; i <= 10; i++) {
        const p = bez(m, k0 + ((1 - k0) * i) / 10);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const m of state.missiles) drawMissile([...m.trail, { x: m.x, y: m.y }], state.nations[m.owner].color);

    drawFx(now);
    drawPlacement(now);
  }

  function drawPlacement(now) {
    fx.ghost = null;
    if (!input.over || state.mode !== 'playing' || input.my < 40 || overHud(input.mx, input.my)) return;
    const p = { x: input.wx, y: input.wy };
    const k = iconK;
    if (state.placing) {
      const type = state.placing;
      const def = UNITS[type];
      const issue = placeIssue(0, type, p) || (me().credits < def.cost ? `Need ${def.cost} credits` : null);
      const col = issue ? '#ef4444' : '#38bdf8';
      // Spacing rings around your other buildings.
      if (BUILDINGS.includes(type)) {
        ctx.lineWidth = k;
        ctx.setLineDash([2 * k, 2 * k]);
        for (const u of state.units) {
          if (u.owner !== 0 || !BUILDINGS.includes(u.type) || dist(u, p) > 90) continue;
          ctx.strokeStyle = dist(u, p) < 14 ? 'rgba(239,68,68,0.8)' : 'rgba(148,163,184,0.35)';
          ctx.beginPath();
          ctx.arc(u.x, u.y, 14, 0, PI2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (type === 'satellite') {
        // Preview of the orbit it will follow.
        const home = REGIONS[me().region].cityList[0];
        const y0 = clamp(home.y, 150, 450);
        ctx.strokeStyle = rgba(col, 0.35);
        ctx.lineWidth = k;
        ctx.setLineDash([3 * k, 4 * k]);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const y = y0 + Math.sin((x / W) * Math.PI * 4) * 140;
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Vision (dashed) and reach (solid) rings.
      ctx.strokeStyle = rgba(col, 0.35);
      ctx.lineWidth = k;
      ctx.setLineDash([3 * k, 4 * k]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, def.vision, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (def.reach) {
        ctx.strokeStyle = rgba(col, 0.55);
        ctx.fillStyle = rgba(col, 0.04);
        ctx.beginPath();
        ctx.arc(p.x, p.y, def.reach, 0, PI2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rgba(col, 0.8);
        ctx.font = `${9 * k}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(def.reachName, p.x, p.y - def.reach - 3 * k);
      }
      drawUnitIcon({ type, x: p.x, y: p.y, mode: 'defend' }, col, 0.75 + 0.25 * Math.sin(now * 6));
      if (issue) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8 * k;
        ctx.beginPath();
        ctx.moveTo(p.x - 9 * k, p.y - 9 * k);
        ctx.lineTo(p.x + 9 * k, p.y + 9 * k);
        ctx.moveTo(p.x + 9 * k, p.y - 9 * k);
        ctx.lineTo(p.x - 9 * k, p.y + 9 * k);
        ctx.stroke();
      }
      fx.ghost = { text: issue || `${def.name} · ${def.cost} credits`, ok: !issue };
      return;
    }
    const u = state.selected;
    if (state.action && u && !u.dead) {
      const range = state.action === 'bomber' ? 400 : state.action === 'subfire' ? 280 : 0;
      if (range) {
        ctx.strokeStyle = 'rgba(239,68,68,0.4)';
        ctx.lineWidth = k;
        ctx.setLineDash([4 * k, 4 * k]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, range, 0, PI2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const col = state.action === 'fighter' ? '#38bdf8' : '#ef4444';
      const ok = !range || dist(u, p) <= range;
      drawReticle(p, ok ? col : '#64748b', state.action === 'fighter' ? 8 : BLAST * 1.4, now);
      if (state.action !== 'fighter') fx.ghost = { text: ok ? `Target · ${estimate(p)}` : 'Out of range', ok };
      return;
    }
    // Silo targeting: preview arcs from the silos that would fire.
    if (u && !u.dead && u.type === 'silo' && state.defcon === 1) {
      const ready = readySilos(0);
      const shooters = input.shift ? ready : ready.length ? [ready.includes(u) ? u : ready.sort((a, b) => dist(a, p) - dist(b, p))[0]] : [];
      for (const s of shooters) {
        const d = dist(s, p);
        const m = { sx: s.x, sy: s.y, cx: (s.x + p.x) / 2, cy: (s.y + p.y) / 2 - Math.min(160, d * 0.35), tx: p.x, ty: p.y };
        ctx.strokeStyle = 'rgba(56,189,248,0.4)';
        ctx.lineWidth = k;
        ctx.setLineDash([3 * k, 4 * k]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(m.cx, m.cy, m.tx, m.ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawReticle(p, shooters.length ? '#ef4444' : '#64748b', BLAST * 1.4, now);
      fx.ghost = shooters.length
        ? { text: `${shooters.length > 1 ? `Salvo of ${shooters.length}` : 'Fire'} · ${estimate(p)}${!input.shift && ready.length > 1 ? ' · Shift: all' : ''}`, ok: true }
        : { text: u.mode === 'launch' ? 'No silo ready yet' : 'Switch to launch mode first', ok: false };
    }
  }

  function drawReticle(p, col, r, now) {
    const k = iconK;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, PI2);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + now * 0.8;
      ctx.moveTo(p.x + Math.cos(a) * (r + 3 * k), p.y + Math.sin(a) * (r + 3 * k));
      ctx.lineTo(p.x + Math.cos(a) * (r - 5 * k), p.y + Math.sin(a) * (r - 5 * k));
    }
    ctx.moveTo(p.x - 4 * k, p.y);
    ctx.lineTo(p.x + 4 * k, p.y);
    ctx.moveTo(p.x, p.y - 4 * k);
    ctx.lineTo(p.x, p.y + 4 * k);
    ctx.stroke();
  }

  // Rough casualties a nuke at p would cause (same maths as detonate()).
  function estimate(p) {
    let dead = 0;
    let mine = 0;
    for (const c of state.cities) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > BLAST * 1.4 || c.pop <= 0) continue;
      const k = c.pop * (0.08 + 0.55 * (1 - d / (BLAST * 1.4)));
      if (c.owner === 0) mine += k;
      else dead += k;
    }
    if (mine > 0.1) return `⚠ ${mine.toFixed(1)}M of YOUR people`;
    return dead > 0.1 ? `est. ${dead.toFixed(1)}M` : 'no cities in blast';
  }

  // ---------------------------------------------------------------------------
  // HUD layout
  // ---------------------------------------------------------------------------

  const BUILD = { x: 8, y: 46, w: 128, h: 32, gap: 4 };
  const BUILD_PANEL = { x: 4, y: 42, w: 136, h: BUILD_ORDER.length * (BUILD.h + BUILD.gap) + 8 };
  const ARSENAL = { x: 4, y: BUILD_PANEL.y + BUILD_PANEL.h + 4, w: 136, h: 56 };
  const MINIMAP = { x: 4, y: H - 82, w: 136, h: 76 };
  const TIMELINE = { x: 134, y: 22, w: 330, h: 10 };
  const SPEEDS = [1, 2, 4, 8];
  const PERSONA_COLOR = { aggressive: '#f87171', defensive: '#60a5fa', sneaky: '#a78bfa' };
  const PERSONA_BLURB = {
    aggressive: 'Builds silos and armies, invades early and strikes first.',
    defensive: 'Turtles behind radar and silo defences; holds fire until hit.',
    sneaky: 'Hides submarines off enemy coasts and strikes from the sea.',
  };

  const nationPanel = () => ({ x: W - 184, y: 42, w: 180, h: 16 + state.nations.length * 32 });

  function buildButtons() {
    return BUILD_ORDER.map((type, k) => ({ id: `build:${type}`, type, x: BUILD.x, y: BUILD.y + k * (BUILD.h + BUILD.gap), w: BUILD.w, h: BUILD.h }));
  }

  function topButtons() {
    const paused = state && state.mode === 'paused';
    const out = SPEEDS.map((s, k) => ({ id: `speed:${s}`, s, label: `${s}×`, x: 604 + k * 38, y: 6, w: 34, h: 26 }));
    return out.concat([
      { id: 'view', label: '⌂', off: camGoal.z <= 1.001 },
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: W - 156 + k * 38, y: 6, w: 34, h: 26 })));
  }

  // Buttons for the selected unit.
  function actionButtons() {
    const u = state.selected;
    if (!u || u.dead || u.owner !== 0) return [];
    const out = [];
    const x0 = 290;
    const y = H - 44;
    const add = (id, label, off = false) => out.push({ id, label, off, x: x0 + out.length * 138, y, w: 130, h: 30 });
    if (u.type === 'silo') {
      add('mode:defend', u.mode === 'defend' ? 'Defending' : 'Defend', u.mode === 'defend' || u.switchT > 0);
      add('mode:launch', u.mode === 'launch' ? 'Ready to launch' : 'Launch mode', u.mode === 'launch' || u.switchT > 0);
      add('allsilos', 'All silos: launch', state.defcon > 2);
    } else if (u.type === 'airbase') {
      add('fighter', `Fighter (${u.fighters})`, u.fighters <= 0 || state.defcon > 4);
      add('bomber', `Bomber (${u.bombers})`, u.bombers <= 0 || state.defcon > 1);
    } else if (u.type === 'sub') {
      add('subfire', `Launch (${u.missiles})`, u.missiles <= 0 || state.defcon > 1);
    }
    return out;
  }

  function selectionPanel() {
    const u = state.selected;
    if (u && !u.dead && u.owner === 0) return { x: 146, y: H - 54, w: 142 + Math.max(1, actionButtons().length) * 138, h: 48 };
    if (state.placing) return { x: 146, y: H - 54, w: 470, h: 48 };
    return null;
  }

  // Is a screen point over a HUD panel (so it isn't a map click)?
  function overHud(x, y) {
    if (y < 40) return true;
    if (state.mode === 'replay') return y > H - 46 && x > 140 && x < 860;
    if (inside(BUILD_PANEL, x, y) || inside(ARSENAL, x, y) || inside(nationPanel(), x, y)) return true;
    if (cam.z > 1.01 && inside(MINIMAP, x, y)) return true;
    const sp = selectionPanel();
    if (sp && inside(sp, x, y)) return true;
    return !!(tutUi && inside(tutUi.rect, x, y));
  }

  function hitTest(x, y) {
    if (!state) return null;
    if (state.mode === 'replay') {
      for (const b of replayButtons()) if (inside(b, x, y)) return b;
      if (inside(SEEK, x, y)) return { id: 'rp:seek' };
      return null;
    }
    for (const b of topButtons()) if (inside(b, x, y)) return b;
    if (state.mode !== 'playing' && state.mode !== 'paused') return null;
    if (tutUi) for (const b of tutUi.buttons) if (inside(b, x, y)) return b;
    for (const b of buildButtons()) if (inside(b, x, y)) return b;
    for (const b of actionButtons()) if (inside(b, x, y)) return b;
    if (cam.z > 1.01 && inside(MINIMAP, x, y)) return { id: 'minimap' };
    return null;
  }

  // ---------------------------------------------------------------------------
  // HUD drawing
  // ---------------------------------------------------------------------------

  function panel(x, y, w, h, border = 'rgba(56,189,248,0.25)') {
    roundRect(x, y, w, h, 8);
    ctx.fillStyle = 'rgba(2,8,20,0.84)';
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function button(b, hover, on) {
    roundRect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = on ? 'rgba(56,189,248,0.35)' : b.off ? 'rgba(255,255,255,0.03)' : hover ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = on ? '#38bdf8' : hover && !b.off ? 'rgba(56,189,248,0.6)' : 'rgba(56,189,248,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = b.off ? 'rgba(226,232,240,0.35)' : '#e2e8f0';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }

  // Split text into lines that fit maxW with the current font.
  function wrap(text, maxW) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  function drawTip(ax, ay, tip) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    let w = ctx.measureText(tip.title).width;
    ctx.font = '11px system-ui, sans-serif';
    for (const l of tip.lines) w = Math.max(w, ctx.measureText(l).width);
    w += 22;
    const h = 22 + tip.lines.length * 15;
    const x = clamp(ax - w / 2, 4, W - w - 4);
    let y = ay - h - 14;
    if (y < 42) y = ay + 18;
    panel(x, y, w, h, rgba(tip.color || '#38bdf8', 0.5));
    ctx.fillStyle = tip.color || '#38bdf8';
    ctx.fillRect(x + 6, y + 7, 3, h - 14);
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(tip.title, x + 15, y + 16);
    ctx.font = '11px system-ui, sans-serif';
    tip.lines.forEach((l, k) => {
      ctx.fillStyle = l.startsWith('⚠') ? '#fca5a5' : '#94a3b8';
      ctx.fillText(l, x + 15, y + 31 + k * 15);
    });
  }

  function unitTip(u) {
    const o = state.nations[u.owner];
    const mine = u.owner === 0;
    const name = UNITS[u.type] ? UNITS[u.type].name : u.type === 'fighter' ? 'Fighter' : 'Bomber';
    const lines = [];
    if (u.type === 'silo') {
      lines.push(u.switchT > 0 ? `Switching to ${u.nextMode} mode… ${Math.ceil(u.switchT)}s` : u.mode === 'launch' ? 'Launch mode: can fire at DEFCON 1' : 'Defend mode: shoots down missiles and planes');
      if (mine) lines.push(`${u.missiles} missiles left`);
    } else if (u.type === 'radar') lines.push('Sees units and missiles in a wide circle');
    else if (u.type === 'airbase') lines.push(mine ? `${u.fighters} fighters · ${u.bombers} bombers` : 'Launches fighters and bombers');
    else if (u.type === 'army') lines.push(`Strength ${u.str.toFixed(0)}${u.target ? ' · invading' : ''}`);
    else if (u.type === 'fleet') lines.push(`Hull ${Math.max(0, u.hp)}/10 · guns sink ships and missiles`);
    else if (u.type === 'sub') lines.push(mine ? `${u.missiles} missiles · hidden from radar` : 'Submarine spotted');
    else if (u.type === 'satellite') lines.push('Reveals everything beneath its orbit');
    else lines.push(u.returning ? 'Returning to base' : u.type === 'bomber' ? 'Carrying a nuclear bomb' : 'On patrol');
    if (mine && UNITS[u.type]) lines.push(u.type === 'silo' ? 'Click to select · Tab cycles silos' : 'Click to select');
    return { title: `${name} · ${mine ? 'yours' : o.name}`, lines, color: o.color };
  }

  function cityTip(c) {
    const o = state.nations[c.owner];
    const lines = [`${c.pop.toFixed(1)}M of ${c.pop0.toFixed(1)}M alive`];
    if (c.region !== o.region) lines.push(`Captured from ${REGIONS[c.region].name}`);
    else lines.push(`${o.name === 'You' ? 'Your city' : o.name} · garrison ${c.garrison.toFixed(0)}`);
    if (state.missiles.some((m) => m.owner !== c.owner && Math.hypot(m.tx - c.x, m.ty - c.y) < BLAST * 1.4)) lines.push('⚠ Missile inbound');
    return { title: c.name, lines, color: o.color };
  }

  function missileTip(m) {
    const o = state.nations[m.owner];
    return { title: `${o.name === 'You' ? 'Your' : o.name} ${m.kind === 'sub' ? 'sub-launched missile' : 'ICBM'}`, lines: [`Impact in ${Math.max(0, m.dur - m.t).toFixed(0)}s`, m.threat ? '⚠ Heading for your territory' : 'Silos and fleets in defend mode can shoot it down'], color: o.color };
  }

  function mapTip() {
    if (!input.over || fx.ghost || state.placing || overHud(input.mx, input.my)) return null;
    if (state.mode !== 'playing' && state.mode !== 'paused') return null;
    const p = { x: input.wx, y: input.wy };
    let best = null;
    let bd = 11 * iconK;
    for (const u of state.units) {
      if (!visibleUnit(0, u)) continue;
      const d = dist(u, p);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) return { at: best, ...unitTip(best) };
    for (const m of state.missiles) if (dist(m, p) < 8 * iconK) return { at: m, ...missileTip(m) };
    if (hoverCity) return { at: hoverCity, ...cityTip(hoverCity) };
    return null;
  }

  function hudTip(x, y) {
    if (!input.over) return null;
    const hit = hitTest(x, y);
    if (hit) {
      if (hit.type) {
        const def = UNITS[hit.type];
        ctx.font = '11px system-ui, sans-serif';
        return { title: `${def.name} · ${def.cost} credits · key ${def.key}`, lines: [...wrap(def.desc, 250), `You have ${owned(0, hit.type)}`], color: '#38bdf8' };
      }
      const tips = {
        view: ['Reset view', 'Home or 0 · scroll to zoom, drag to pan'],
        pause: ['Pause', 'P or Esc'],
        mute: ['Sound', 'M toggles'],
        full: ['Fullscreen', 'F toggles'],
        'mode:defend': ['Defend mode', 'Shoots down missiles and planes from DEFCON 3'],
        'mode:launch': ['Launch mode', 'Takes 8s to switch. Can fire at DEFCON 1, but stops defending'],
        allsilos: ['All silos: launch', 'Switch every armed silo to launch mode'],
        fighter: ['Fighter', 'From DEFCON 4. Click the map to scout or intercept'],
        bomber: ['Bomber', 'DEFCON 1. Carries one nuke, range 400'],
        subfire: ['Submarine launch', 'DEFCON 1. Range 280, reveals the sub'],
        minimap: ['Minimap', 'Click or drag to move the view'],
      };
      if (hit.id.startsWith('speed:')) return { title: `Game speed ${hit.s}×`, lines: [`Key ${SPEEDS.indexOf(hit.s) + 1}`], color: '#38bdf8' };
      if (tips[hit.id]) return { title: tips[hit.id][0], lines: [tips[hit.id][1]], color: '#38bdf8' };
      return null;
    }
    if (y < 38 && x >= TIMELINE.x && x <= TIMELINE.x + TIMELINE.w) {
      return { title: 'DEFCON timeline', lines: [5, 4, 3, 2, 1].map((d) => `${d} at ${formatTime(DEFCON_AT[d])} · ${DEFCON_INFO[d].tag}: ${DEFCON_INFO[d].sub}`).concat([`Ceasefire at ${formatTime(END)}`]), color: defconColor(state.defcon) };
    }
    if (inside(ARSENAL, x, y)) return { title: 'Arsenal', lines: ['ICBMs: missiles left in your silos (ready ones are in launch mode)', 'SLBMs: submarine missiles · bombers: one nuke each'], color: '#38bdf8' };
    const np = nationPanel();
    if (inside(np, x, y)) {
      const ns = [...state.nations].sort((a, b) => b.score - a.score);
      const o = ns[Math.floor((y - np.y - 12) / 32)];
      if (!o) return null;
      const lines = [`${REGIONS[o.region].name} · ${popOf(o.id).toFixed(1)}M alive`, `Killed ${o.kills.toFixed(1)}M · lost ${o.losses.toFixed(1)}M · ${o.fired} launches`];
      if (o.id !== 0 && o.persona) lines.unshift(`${PERSONAS[o.persona].label}: ${PERSONA_BLURB[o.persona]}`);
      return { title: o.name === 'You' ? 'Your nation' : o.name, lines, color: o.color };
    }
    return null;
  }

  function drawTimeline(now, t, dc) {
    const T = TIMELINE;
    const X = (tt) => T.x + (clamp(tt, 0, END) / END) * T.w;
    ctx.textAlign = 'left';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const next = dc > 1 ? `DEFCON ${dc - 1} in ${formatTime(DEFCON_AT[dc - 1] - t)} · ${DEFCON_INFO[dc - 1].soon}` : `Ceasefire in ${formatTime(END - t)}`;
    ctx.fillText(next, T.x, 15);
    for (const lvl of [5, 4, 3, 2, 1]) {
      const x0 = X(DEFCON_AT[lvl]);
      const x1 = lvl > 1 ? X(DEFCON_AT[lvl - 1]) : X(END);
      const col = defconColor(lvl);
      const cur = lvl === dc;
      roundRect(x0 + 0.5, T.y, x1 - x0 - 1, T.h, 2);
      ctx.fillStyle = rgba(col, cur ? 0.45 : t >= DEFCON_AT[lvl] ? 0.12 : 0.22);
      ctx.fill();
      if (cur) {
        ctx.strokeStyle = col;
        ctx.stroke();
      }
      ctx.fillStyle = cur ? '#fff' : rgba(col, 0.9);
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      // Full tag if it fits, else just the number.
      const label = ctx.measureText(`${lvl} ${DEFCON_INFO[lvl].tag}`).width + 4 < x1 - x0 ? `${lvl} ${DEFCON_INFO[lvl].tag}` : String(lvl);
      ctx.fillText(label, (x0 + x1) / 2, T.y + 8);
    }
    const px = X(t);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, T.y - 3, 2, T.h + 6);
    ctx.beginPath();
    ctx.moveTo(px - 4, T.y - 5);
    ctx.lineTo(px + 4, T.y - 5);
    ctx.lineTo(px, T.y - 1);
    ctx.fill();
  }

  function drawDefconBox(now, dc, label) {
    const blink = dc === 1 && !REDUCED && Math.floor(now * 2) % 2;
    roundRect(8, 6, 118, 26, 5);
    ctx.fillStyle = blink ? '#7f1d1d' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = defconColor(dc);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = defconColor(dc);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 67, 24);
  }

  function drawNations(rows) {
    const np = nationPanel();
    panel(np.x, np.y, np.w, np.h);
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText('PEOPLE   SCORE', W - 12, 54);
    rows.forEach((r, k) => {
      const o = r.n;
      const y = 70 + k * 32;
      ctx.globalAlpha = o.alive || r.replay ? 1 : 0.45;
      ctx.fillStyle = o.color;
      ctx.fillRect(W - 176, y - 9, 4, 24);
      ctx.textAlign = 'left';
      ctx.font = o.id === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(o.name, W - 166, y + 1);
      // Second line: continent, then the AI's personality.
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#64748b';
      const where = `${REGIONS[o.region].name}${o.alive || r.replay ? '' : ' · fallen'}`;
      ctx.fillText(where, W - 166, y + 14);
      if (o.id !== 0 && o.persona) {
        const ww = ctx.measureText(where).width;
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillStyle = PERSONA_COLOR[o.persona];
        ctx.fillText(PERSONAS[o.persona].label.toUpperCase(), W - 160 + ww, y + 14);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${r.pop.toFixed(0)}M`, W - 60, y + 1);
      ctx.fillStyle = o.color;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(String(r.score), W - 12, y + 1);
    });
    ctx.globalAlpha = 1;
  }

  function drawMinimap(now, missiles) {
    const M = MINIMAP;
    const k = M.w / W;
    panel(M.x, M.y, M.w, M.h);
    ctx.save();
    roundRect(M.x, M.y, M.w, M.h, 8);
    ctx.clip();
    for (const id of REGION_IDS) {
      const n = nationOf(id);
      ctx.fillStyle = n ? rgba(n.color, 0.35) : 'rgba(100,116,139,0.25)';
      for (const s of REGIONS[id].shapes) {
        ctx.beginPath();
        s.forEach((p, i) => (i ? ctx.lineTo(M.x + p.x * k, M.y + p.y * k) : ctx.moveTo(M.x + p.x * k, M.y + p.y * k)));
        ctx.fill();
      }
    }
    ctx.fillStyle = '#fff';
    for (const m of missiles) ctx.fillRect(M.x + m.x * k - 0.75, M.y + m.y * k - 0.75, 1.5, 1.5);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(M.x + cam.x * k, M.y + cam.y * k, (W / cam.z) * k, (H / cam.z) * k);
    ctx.restore();
  }

  function jumpMinimap(p) {
    const k = MINIMAP.w / W;
    camGoal.x = (p.x - MINIMAP.x) / k - W / 2 / camGoal.z;
    camGoal.y = (p.y - MINIMAP.y) / k - H / 2 / camGoal.z;
    clampView(camGoal);
    Object.assign(cam, camGoal);
  }

  function drawBanner(now) {
    const b = fx.banner;
    if (!b) return;
    const age = now - b.at;
    const life = b.detail ? 4 : 3;
    if (age > life) {
      fx.banner = null;
      return;
    }
    const kin = clamp(age / 0.35, 0, 1);
    const a = Math.min(kin, clamp((life - age) / 0.6, 0, 1));
    const cy = 205;
    const s = canvas.width / W;
    ctx.globalAlpha = a * 0.78;
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, 'rgba(2,6,23,0)');
    band.addColorStop(0.2, 'rgba(2,6,23,1)');
    band.addColorStop(0.8, 'rgba(2,6,23,1)');
    band.addColorStop(1, 'rgba(2,6,23,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, cy - 56, W, 112);
    const lw = W * 0.42 * (1 - Math.pow(1 - kin, 3));
    ctx.globalAlpha = a;
    ctx.fillStyle = b.color;
    ctx.fillRect(W / 2 - lw, cy - 56, lw * 2, 1.5);
    ctx.fillRect(W / 2 - lw, cy + 55, lw * 2, 1.5);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 26 * s;
    const grow = REDUCED ? 1 : 1 + 0.12 * (1 - kin);
    ctx.translate(W / 2, cy + 4);
    ctx.scale(grow, grow);
    ctx.font = 'bold 54px system-ui, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillStyle = b.color;
    ctx.fillText(b.title, 0, 0);
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(b.sub.toUpperCase(), W / 2, cy + 30);
    if (b.detail) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(b.detail, W / 2, cy + 47);
    }
    ctx.globalAlpha = 1;
  }

  function drawScreenFx(now) {
    ctx.drawImage(vignette('rgba(0,0,0,0.8)', 0.55), 0, 0, W, H);
    let red = 0;
    if (state.mode === 'playing' || state.mode === 'paused') {
      const pulse = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(now * 2.4);
      if (state.defcon === 1 && !state.over) red = 0.18 + 0.16 * pulse;
      if (state.missiles.some((m) => m.threat)) red += 0.3 + 0.25 * (REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(now * 7));
    }
    if (red > 0) {
      ctx.globalAlpha = clamp(red, 0, 1);
      ctx.drawImage(vignette('rgba(220,38,38,1)', 0.62), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (fx.flash > 0.01) {
      ctx.fillStyle = `rgba(255,247,237,${fx.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawHud(now) {
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    const n = me();
    const dc = state.defcon;

    // Top bar.
    ctx.fillStyle = 'rgba(2,8,20,0.92)';
    ctx.fillRect(0, 0, W, 38);
    ctx.strokeStyle = rgba(defconColor(dc), 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 38.5);
    ctx.lineTo(W, 38.5);
    ctx.stroke();
    drawDefconBox(now, dc, `DEFCON ${dc}`);
    drawTimeline(now, state.t, dc);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const cr = String(Math.floor(n.credits));
    ctx.fillText(cr, 476, 18);
    const cw = ctx.measureText(cr).width;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('credits', 480 + cw, 18);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`+${(popOf(0) * INCOME).toFixed(1)}/s · ${popOf(0).toFixed(1)}M people`, 476, 31);
    for (const b of topButtons()) button(b, hover && hover.id === b.id, b.s === state.speed);
    if (cam.z > 1.01) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cam.z.toFixed(1)}×`, 800, 24);
    }

    // Build panel, with how many of each you own.
    panel(BUILD_PANEL.x, BUILD_PANEL.y, BUILD_PANEL.w, BUILD_PANEL.h);
    for (const b of buildButtons()) {
      const def = UNITS[b.type];
      const afford = n.credits >= def.cost && n.alive;
      const on = state.placing === b.type;
      roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fillStyle = on ? 'rgba(56,189,248,0.3)' : hover && hover.id === b.id ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      if (on) {
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();
      }
      drawUnitIcon({ type: b.type, x: b.x + 16, y: b.y + b.h / 2, mode: 'defend', heading: 0 }, afford ? '#38bdf8' : '#475569', 1, 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = afford ? '#e2e8f0' : '#64748b';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(def.name, b.x + 32, b.y + 14);
      ctx.fillStyle = afford ? '#fde68a' : '#64748b';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${def.cost} · ${def.key}`, b.x + 32, b.y + 27);
      const count = owned(0, b.type);
      if (count) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#7dd3fc';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(`×${count}`, b.x + b.w - 6, b.y + 27);
      }
    }

    // Arsenal.
    const silos = state.units.filter((u) => u.owner === 0 && u.type === 'silo');
    const icbm = silos.reduce((s, u) => s + u.missiles, 0);
    const ready = silos.filter((u) => u.mode === 'launch' && u.switchT <= 0 && u.missiles > 0).length;
    const slbm = state.units.reduce((s, u) => s + (u.owner === 0 && u.type === 'sub' ? u.missiles : 0), 0);
    const bombers = state.units.reduce((s, u) => s + (u.owner === 0 && u.type === 'airbase' ? u.bombers : 0), 0);
    panel(ARSENAL.x, ARSENAL.y, ARSENAL.w, ARSENAL.h);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillText('ARSENAL', ARSENAL.x + 10, ARSENAL.y + 14);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = icbm ? '#e2e8f0' : '#64748b';
    ctx.fillText(`ICBM ${icbm}`, ARSENAL.x + 10, ARSENAL.y + 30);
    ctx.fillStyle = ready ? '#f87171' : '#64748b';
    ctx.fillText(`${ready} silo${ready === 1 ? '' : 's'} armed`, ARSENAL.x + 62, ARSENAL.y + 30);
    ctx.fillStyle = slbm || bombers ? '#e2e8f0' : '#64748b';
    ctx.fillText(`SLBM ${slbm} · Bombers ${bombers}`, ARSENAL.x + 10, ARSENAL.y + 46);

    // Nations.
    drawNations([...state.nations].sort((a, b) => b.score - a.score).map((o) => ({ n: o, pop: popOf(o.id), score: o.score })));

    // Selection panel.
    const u = state.selected;
    const sp = selectionPanel();
    if (u && !u.dead && u.owner === 0) {
      panel(sp.x, sp.y, sp.w, sp.h);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(UNITS[u.type].name, 156, H - 34);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      let info = '';
      if (u.type === 'silo') {
        if (u.switchT > 0) info = `Switching… ${Math.ceil(u.switchT)}s`;
        else if (u.mode === 'launch' && dc === 1) info = `${u.missiles} left · click a target`;
        else info = `${u.missiles} missiles · ${u.mode}`;
      } else if (u.type === 'army') info = u.target ? `Invading · strength ${u.str.toFixed(0)}` : `Strength ${u.str.toFixed(0)} · click a city`;
      else if (u.type === 'fleet') info = `Hull ${Math.max(0, u.hp)} · click the sea`;
      else if (u.type === 'sub') info = `${u.missiles} missiles · click the sea`;
      else if (u.type === 'airbase') info = `${u.fighters} fighters · ${u.bombers} bombers`;
      else info = 'Watching';
      ctx.fillText(info, 156, H - 18);
      for (const b of actionButtons()) button(b, hover && hover.id === b.id, state.action === b.id);
    } else if (state.placing) {
      const def = UNITS[state.placing];
      panel(sp.x, sp.y, sp.w, sp.h);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(`Place ${def.name.toLowerCase()} · ${def.cost} credits · right-click or Esc cancels`, 156, H - 34);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(def.desc, 156, H - 18);
    }

    if (cam.z > 1.01) drawMinimap(now, state.missiles);

    // Log.
    ctx.textAlign = 'right';
    state.log.forEach((l, k) => {
      ctx.globalAlpha = clamp(l.t / 2, 0, 1) * (1 - k * 0.12);
      ctx.fillStyle = l.color;
      ctx.font = k === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(l.text, W - 10, H - 12 - k * 17);
    });
    ctx.globalAlpha = 1;

    // Incoming warning.
    const threats = state.missiles.filter((m) => m.threat);
    if (threats.length) {
      const eta = Math.min(...threats.map((m) => m.dur - m.t));
      const text = `⚠ ${threats.length} INCOMING · impact in ${Math.max(0, eta).toFixed(0)}s`;
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 24;
      const on = REDUCED || Math.floor(now * 3) % 2 === 0;
      roundRect(W / 2 - w / 2, 46, w, 24, 12);
      ctx.fillStyle = on ? 'rgba(127,29,29,0.9)' : 'rgba(69,10,10,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
      ctx.fillStyle = '#fecaca';
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, 63);
    }

    drawTutorial(now);

    // Ghost label next to the cursor.
    if (fx.ghost && input.over) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      const w = ctx.measureText(fx.ghost.text).width + 16;
      const x = clamp(input.mx + 16, 4, W - w - 4);
      const y = clamp(input.my + 14, 42, H - 26);
      roundRect(x, y, w, 20, 10);
      ctx.fillStyle = fx.ghost.ok ? 'rgba(8,47,73,0.92)' : 'rgba(69,10,10,0.92)';
      ctx.fill();
      ctx.strokeStyle = fx.ghost.ok ? '#38bdf8' : '#ef4444';
      ctx.stroke();
      ctx.fillStyle = fx.ghost.ok ? '#e0f2fe' : '#fecaca';
      ctx.textAlign = 'left';
      ctx.fillText(fx.ghost.text, x + 8, y + 14);
    }

    // Tooltips.
    const ht = hudTip(input.mx, input.my);
    if (ht) drawTip(input.mx, input.my, ht);
    else {
      const mt = mapTip();
      if (mt) {
        const s = toScreen(mt.at);
        drawTip(s.x, s.y - 4, mt);
      }
    }

    drawBanner(now);
  }

  // ---------------------------------------------------------------------------
  // Tutorial (first play; skippable, remembered in localStorage)
  // ---------------------------------------------------------------------------

  let tutUi = null;
  let tutMoved = false;

  const TUTORIAL = [
    {
      title: 'Welcome, Commander',
      text: () => `You lead ${REGIONS[me().region].name}. The clock is held while you set up. Pick a missile silo from the build panel, or press S.`,
      done: () => state.placing === 'silo' || owned(0, 'silo') > 0,
      focus: () => buildButtons()[0],
    },
    {
      title: 'Place your silo',
      text: () => 'Click inside your glowing continent. The ghost shows the silo’s intercept range, and turns red with a reason where it can’t go.',
      done: () => owned(0, 'silo') > 0,
    },
    {
      title: 'Eyes on the sky',
      text: () => 'Radar reveals enemy units and missiles far away. Press R and place one near your coast.',
      done: () => owned(0, 'radar') > 0,
      focus: () => buildButtons()[1],
    },
    {
      title: 'Look around',
      text: () => 'Scroll or pinch to zoom, drag to pan, Home or 0 to reset. Hover anything for details.',
      next: 'Next',
      done: () => tutMoved && cam.z > 1.2,
    },
    {
      title: 'The countdown',
      text: () => 'DEFCON falls along the top bar: fighters at 4, war at 3, nukes at 1. Then select a silo, switch it to launch mode and click a target. Shift-click fires every ready silo; Tab cycles silos.',
      next: 'Start the clock',
      focus: () => ({ x: TIMELINE.x - 4, y: 3, w: TIMELINE.w + 8, h: 33 }),
    },
  ];

  function checkTutorial() {
    while (state.tut !== null) {
      const s = TUTORIAL[state.tut];
      if (!s.done || !s.done()) break;
      advanceTutorial();
    }
  }

  function advanceTutorial() {
    state.tut++;
    Sound.click();
    if (state.tut >= TUTORIAL.length) endTutorial();
  }

  function endTutorial() {
    state.tut = null;
    tutUi = null;
    save.tutorial = false;
    writeSave();
    log('The clock is running. Good luck, Commander.', '#38bdf8');
  }

  function drawTutorial(now) {
    tutUi = null;
    if (state.tut === null || state.mode !== 'playing') return;
    const s = TUTORIAL[state.tut];
    const w = 400;
    ctx.font = '12px system-ui, sans-serif';
    const lines = wrap(s.text(), w - 30);
    const h = 66 + lines.length * 16;
    // Keep the card off your own continent.
    const home = REGIONS[me().region].cityList;
    const top = home.reduce((sum, c) => sum + c.y, 0) / home.length > 280;
    const x = 300;
    const y = top ? 46 : H - 62 - h;
    const f = s.focus && s.focus();
    if (f) {
      const pulse = REDUCED ? 0.7 : 0.5 + 0.5 * Math.sin(now * 5);
      roundRect(f.x - 3, f.y - 3, f.w + 6, f.h + 6, 8);
      ctx.strokeStyle = `rgba(250,204,21,${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    panel(x, y, w, h, 'rgba(250,204,21,0.6)');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`BRIEFING ${state.tut + 1}/${TUTORIAL.length}`, x + 14, y + 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(s.title, x + 96, y + 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px system-ui, sans-serif';
    lines.forEach((l, k) => ctx.fillText(l, x + 14, y + 38 + k * 16));
    const by = y + h - 32;
    const buttons = [{ id: 'tut:skip', label: 'Skip tutorial', x: x + 12, y: by, w: 104, h: 24 }];
    if (s.next) buttons.push({ id: 'tut:next', label: s.next, x: x + w - 132, y: by, w: 120, h: 24 });
    const hover = input.over ? buttons.find((b) => inside(b, input.mx, input.my)) : null;
    for (const b of buttons) button(b, hover === b, b.id === 'tut:next');
    tutUi = { rect: { x, y, w, h }, buttons };
  }

  // ---------------------------------------------------------------------------
  // Replay
  // ---------------------------------------------------------------------------

  const replay = { t: 0, end: 0, playing: false, speed: 20 };
  const REPLAY_SPEEDS = [10, 20, 40];
  const SEEK = { x: 150, y: H - 44, w: 700, h: 38 };
  const SEEK_BAR = { x: 160, y: H - 26, w: 680, h: 12 };

  function replayButtons() {
    const out = [{ id: 'rp:play', label: replay.playing ? 'II' : '▶', x: 560, y: 6, w: 34, h: 26 }];
    REPLAY_SPEEDS.forEach((s, k) => out.push({ id: `rp:speed:${s}`, s, label: `${s}×`, x: 604 + k * 44, y: 6, w: 40, h: 26 }));
    out.push({ id: 'rp:exit', label: 'Exit replay', x: W - 118, y: 6, w: 110, h: 26 });
    return out;
  }

  function startReplay() {
    if (!state || !state.rec.snaps.length) return;
    replay.end = state.rec.end || state.t;
    replay.t = 0;
    replay.playing = true;
    state.mode = 'replay';
    fx.booms = [];
    fx.banner = null;
    showOverlay(null);
    resetView(true);
  }

  function exitReplay() {
    state.mode = 'over';
    replay.playing = false;
    resetView(true);
    showOverlay('over');
  }

  function seekTo(x) {
    replay.t = clamp(((x - SEEK_BAR.x) / SEEK_BAR.w) * replay.end, 0, replay.end);
  }

  // City populations and owners at replay time t, from the snapshots.
  function snapAt(t) {
    const s = state.rec.snaps;
    let i = 0;
    while (i < s.length - 1 && s[i + 1].t <= t) i++;
    const a = s[i];
    const b = s[i + 1] || a;
    const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
    return { a, b, k };
  }

  function drawReplayWorld(now) {
    const rt = replay.t;
    const R = state.rec;
    drawFallout(R.blasts.filter((b) => b.t <= rt), rt);
    const { a, b, k } = snapAt(rt);
    const list = state.cities.map((c, i) => ({ c, pop: a.pop[i] + (b.pop[i] - a.pop[i]) * k, owner: a.own[i] }));
    for (const it of list) drawCity(it.c, it.pop, it.owner, now);
    drawCityLabels(list);
    for (const m of R.missiles) {
      const end = m.te ?? m.t0 + m.dur;
      if (rt < m.t0 || rt > end) continue;
      const kk = clamp((rt - m.t0) / m.dur, 0, 1);
      const k0 = Math.max(0, kk - 0.3);
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push(bez(m, k0 + ((kk - k0) * i) / 14));
      drawMissile(pts, state.nations[m.o].color);
    }
    // Effects age with replay time, scaled so they read at any speed.
    const sp = Math.max(1, replay.speed / 3);
    for (const bl of R.blasts) {
      const age = (rt - bl.t) / sp;
      if (age >= 0 && age < BOOM_LIFE.nuke) drawNuke(bl, age);
    }
    for (const m of R.missiles) {
      if (m.te == null || m.hit) continue;
      const age = (rt - m.te) / sp;
      if (age < 0 || age >= BOOM_LIFE.icpt) continue;
      const p = bez(m, clamp((m.te - m.t0) / m.dur, 0, 1));
      drawIntercept(p.x, p.y, age);
    }
    for (const mk of R.marks) {
      const age = (rt - mk.t) / sp;
      if (age < 0 || age > BOOM_LIFE.cap) continue;
      ctx.globalAlpha = 1 - age / BOOM_LIFE.cap;
      ctx.strokeStyle = state.nations[mk.o].color;
      ctx.lineWidth = 2 * iconK;
      ctx.beginPath();
      ctx.arc(mk.x, mk.y, (8 + (age / BOOM_LIFE.cap) * 26) * iconK, 0, PI2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawReplayHud(now) {
    const rt = replay.t;
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    ctx.fillStyle = 'rgba(2,8,20,0.92)';
    ctx.fillRect(0, 0, W, 38);
    const dc = defconAt(rt);
    drawDefconBox(now, dc, `DEFCON ${dc}`);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('● REPLAY', 138, 24);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${formatTime(rt)} / ${formatTime(replay.end)}`, 220, 24);
    const R = state.rec;
    const launched = R.missiles.filter((m) => m.t0 <= rt).length;
    const blasts = R.blasts.filter((b) => b.t <= rt).length;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${launched} launched · ${blasts} detonations`, 320, 24);
    for (const b of replayButtons()) button(b, hover && hover.id === b.id, b.s === replay.speed);

    const { a, b, k } = snapAt(rt);
    const rows = state.nations.map((o, i) => {
      let pop = 0;
      state.cities.forEach((c, j) => {
        if (a.own[j] === i) pop += a.pop[j] + (b.pop[j] - a.pop[j]) * k;
      });
      return { n: o, pop, score: Math.round(a.score[i] + (b.score[i] - a.score[i]) * k), replay: true };
    });
    drawNations(rows.sort((p, q) => q.score - p.score));

    // Timeline with DEFCON bands, detonation density and captures.
    panel(SEEK.x, SEEK.y, SEEK.w, SEEK.h);
    const X = (t) => SEEK_BAR.x + (t / Math.max(1, replay.end)) * SEEK_BAR.w;
    for (const lvl of [5, 4, 3, 2, 1]) {
      const x0 = X(Math.min(DEFCON_AT[lvl], replay.end));
      const x1 = lvl > 1 ? X(Math.min(DEFCON_AT[lvl - 1], replay.end)) : X(replay.end);
      if (x1 - x0 < 1) continue;
      ctx.fillStyle = rgba(defconColor(lvl), 0.25);
      ctx.fillRect(x0, SEEK_BAR.y, x1 - x0, SEEK_BAR.h);
    }
    const bins = new Array(140).fill(0);
    for (const bl of R.blasts) bins[Math.min(139, Math.floor((bl.t / Math.max(1, replay.end)) * 140))]++;
    const peak = Math.max(1, ...bins);
    ctx.fillStyle = 'rgba(251,146,60,0.9)';
    bins.forEach((c, i) => {
      if (!c) return;
      const h = 3 + (c / peak) * 12;
      ctx.fillRect(SEEK_BAR.x + (i / 140) * SEEK_BAR.w, SEEK_BAR.y - h + 1, SEEK_BAR.w / 140 - 0.5, h);
    });
    for (const mk of R.marks) {
      ctx.fillStyle = state.nations[mk.o].color;
      const x = X(mk.t);
      ctx.beginPath();
      ctx.moveTo(x, SEEK_BAR.y + SEEK_BAR.h + 1);
      ctx.lineTo(x - 3, SEEK_BAR.y + SEEK_BAR.h + 6);
      ctx.lineTo(x + 3, SEEK_BAR.y + SEEK_BAR.h + 6);
      ctx.fill();
    }
    const px = X(rt);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, SEEK_BAR.y - 16, 2, SEEK_BAR.h + 18);
    ctx.fillStyle = '#64748b';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Click or drag to seek · Space play/pause · Esc exit', SEEK.x + 10, SEEK.y + 10);
    if (cam.z > 1.01) {
      const live = R.missiles.filter((m) => rt >= m.t0 && rt <= (m.te ?? m.t0 + m.dur)).map((m) => bez(m, clamp((rt - m.t0) / m.dur, 0, 1)));
      drawMinimap(now, live);
    }
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay)
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

  function eventsHtml(list) {
    if (!list.length) return '<p class="help">Nothing has happened yet.</p>';
    return `<ol class="nk-events">${list.map((e) => `<li><time>${formatTime(e.t)}</time><span style="color:${e.color}">${escapeHtml(e.text)}</span></li>`).join('')}</ol>`;
  }

  // Score over time, one line per nation, from the replay snapshots.
  function scoreChart() {
    const snaps = state.rec.snaps;
    if (snaps.length < 2) return '';
    const w = 560;
    const h = 120;
    const T = Math.max(1, snaps[snaps.length - 1].t);
    let lo = 0;
    let hi = 10;
    for (const s of snaps) for (const v of s.score) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const X = (t) => ((t / T) * w).toFixed(1);
    const Y = (v) => (h - 4 - ((v - lo) / (hi - lo)) * (h - 14)).toFixed(1);
    const bands = [4, 3, 2, 1].filter((l) => DEFCON_AT[l] < T).map((l) => `<line x1="${X(DEFCON_AT[l])}" x2="${X(DEFCON_AT[l])}" y1="0" y2="${h}" stroke="${defconColor(l)}" stroke-opacity="0.4" stroke-dasharray="3 3"/><text x="${Number(X(DEFCON_AT[l])) + 3}" y="10" fill="${defconColor(l)}" font-size="9">DEFCON ${l}</text>`).join('');
    const zero = `<line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="#334155"/>`;
    const lines = state.nations.map((n, i) => `<polyline fill="none" stroke="${n.color}" stroke-width="${i === 0 ? 2.5 : 1.5}" stroke-linejoin="round" points="${snaps.map((s) => `${X(s.t)},${Y(s.score[i])}`).join(' ')}"/>`).join('');
    return `<svg class="nk-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Score over time">${zero}${bands}${lines}</svg>`;
  }

  const CONTROLS = 'Build: pick a unit on the left (S R B A N U T) and click the map · click a unit to command it · Shift-click fires every ready silo · Tab cycles silos · L toggles a silo’s mode · scroll/pinch zoom, drag to pan, Home resets · 1–4 speed · P pause · M mute · F fullscreen';

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    if (kind === 'menu') {
      const regions = REGION_IDS.map((id) => `<button type="button" data-region="${id}" class="${save.region === id ? 'on' : ''}">${REGIONS[id].name}</button>`).join('');
      const rivals = [1, 2, 3, 4, 5].map((k) => `<button type="button" data-rivals="${k}" class="${save.rivals === k ? 'on' : ''}">${k}</button>`).join('');
      overlay.innerHTML = `
        <div class="nk-panel">
          <h2>Nameless Nuke</h2>
          <p>Lead a continent through a nuclear crisis. Build up while DEFCON counts down from 5 to 1: conventional war starts at DEFCON 3 and missiles fly at DEFCON 1. Score 2 points per million enemy casualties and lose 1 per million of your own.</p>
          <div class="nk-opt"><span>Your continent</span>${regions}</div>
          <div class="nk-opt"><span>Rivals</span>${rivals}</div>
          <div class="nk-opt"><span>Briefing</span><button type="button" data-tut="1" class="${save.tutorial ? 'on' : ''}">Show tutorial</button><button type="button" data-tut="0" class="${save.tutorial ? '' : 'on'}">Skip it</button></div>
          <div class="row"><button type="button" class="primary" data-act="start">Start</button></div>
          ${save.games ? `<p class="help">Record: ${save.wins} won of ${save.games}${save.best !== null ? ` · best score ${save.best}` : ''}</p>` : ''}
          <p class="help">${CONTROLS}. Rivals are aggressive, defensive or sneaky. This is a game: no real places are harmed.</p>
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div class="nk-panel">
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
          <h3 class="nk-sub">Escalation</h3>
          ${eventsHtml(state.events.slice(-10))}
          <p class="help">${CONTROLS}</p>
        </div>`;
    } else if (kind === 'over') {
      const ns = [...state.nations].sort((a, b) => b.score - a.score);
      const won = ns[0].id === 0;
      const rows = ns.map((o, k) => `<tr><td>${k + 1}</td><td style="color:${o.color}">${o.name}</td><td>${o.id === 0 ? '—' : `<span style="color:${PERSONA_COLOR[o.persona]}">${PERSONAS[o.persona].label}</span>`}</td><td>${REGIONS[o.region].name}</td><td>${popOf(o.id).toFixed(1)}M</td><td>${o.kills.toFixed(1)}M</td><td>${o.losses.toFixed(1)}M</td><td><b>${o.score}</b></td></tr>`).join('');
      const launches = state.rec.missiles.length;
      const blasts = state.rec.blasts.length;
      const dead = state.nations.reduce((s, o) => s + o.losses, 0);
      overlay.innerHTML = `
        <div class="nk-panel nk-results">
          <h2>${won ? 'Victory' : 'Defeat'}</h2>
          <p>${won ? 'Your nation finished with the highest score.' : `${ns[0].name} finished with the highest score.`} ${launches} missiles launched, ${blasts} detonations, ${dead.toFixed(0)} million dead. There are no real winners in a nuclear war.</p>
          <div class="row">
            <button type="button" class="primary" data-act="replay">Watch replay</button>
            <button type="button" data-act="start">Play again</button>
            <button type="button" data-act="menu">Menu</button>
          </div>
          <div class="nk-scroll"><table class="nk-table"><thead><tr><th></th><th>Nation</th><th>Style</th><th>Continent</th><th>Alive</th><th>Killed</th><th>Lost</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div>
          <h3 class="nk-sub">Score over time</h3>
          ${scoreChart()}
          <details class="nk-log"><summary>Escalation log (${state.events.length})</summary>${eventsHtml(state.events)}</details>
        </div>`;
    }
    overlay.classList.add('open');
  }

  function showMenu() {
    newGame();
    state.mode = 'menu';
    resetView(true);
    showOverlay('menu');
  }

  function start() {
    newGame();
    resetView(true);
    showOverlay(null);
    fx.booms = [];
    fx.banner = null;
    tutMoved = false;
    if (!AUTOPLAY && save.tutorial) state.tut = 0;
    escalate('DEFCON 5: build your defences', defconColor(5));
    if (state.tut === null) banner('DEFCON 5', DEFCON_INFO[5].title, defconColor(5), DEFCON_INFO[5].sub);
  }

  function finish() {
    state.mode = 'over';
    state.rec.end = state.t;
    snapshot();
    const ns = [...state.nations].sort((a, b) => b.score - a.score);
    save.games++;
    if (ns[0].id === 0) save.wins++;
    if (save.best === null || me().score > save.best) save.best = me().score;
    writeSave();
    showOverlay('over');
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing') {
      state.mode = 'paused';
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

  function cancelOrders() {
    state.placing = null;
    state.action = null;
    state.selected = null;
  }

  function activate(b) {
    const u = state.selected;
    if (b.id === 'pause') togglePause();
    else if (b.id === 'mute') Sound.muted = !Sound.muted;
    else if (b.id === 'full') toggleFullscreen();
    else if (b.id === 'view') resetView();
    else if (b.id === 'tut:skip') {
      endTutorial();
      Sound.click();
    } else if (b.id === 'tut:next') advanceTutorial();
    else if (b.id === 'rp:play') {
      if (replay.t >= replay.end) replay.t = 0;
      replay.playing = !replay.playing;
    } else if (b.id === 'rp:exit') exitReplay();
    else if (b.id.startsWith('rp:speed:')) replay.speed = b.s;
    else if (b.id.startsWith('speed:')) state.speed = b.s;
    else if (b.off) Sound.bad();
    else if (b.id.startsWith('build:')) {
      state.placing = state.placing === b.type ? null : b.type;
      state.selected = null;
      state.action = null;
      Sound.click();
    } else if (b.id.startsWith('mode:') && u) {
      if (setSiloMode(u, b.id.slice(5))) Sound.click();
    } else if (b.id === 'allsilos') {
      let k = 0;
      for (const o of state.units) if (o.owner === 0 && o.type === 'silo' && o.missiles > 0 && setSiloMode(o, 'launch')) k++;
      log(k ? `${k} silo${k === 1 ? '' : 's'} switching to launch mode` : 'All silos are already in launch mode', '#f87171');
    } else if (['fighter', 'bomber', 'subfire'].includes(b.id)) {
      state.action = state.action === b.id ? null : b.id;
      Sound.click();
    }
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    Sound.click();
    if (b.dataset.region) {
      save.region = b.dataset.region;
      writeSave();
      showMenu();
    } else if (b.dataset.rivals) {
      save.rivals = Number(b.dataset.rivals);
      writeSave();
      showMenu();
    } else if (b.dataset.tut) {
      save.tutorial = b.dataset.tut === '1';
      writeSave();
      showMenu();
    } else if (b.dataset.act === 'start') start();
    else if (b.dataset.act === 'resume') togglePause();
    else if (b.dataset.act === 'menu') showMenu();
    else if (b.dataset.act === 'replay') startReplay();
  });

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const input = { mx: W / 2, my: H / 2, wx: W / 2, wy: H / 2, over: false, shift: false };
  let hoverCity = null;
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function setPointer(p) {
    input.mx = p.x;
    input.my = p.y;
    const w = toWorld(p);
    input.wx = w.x;
    input.wy = w.y;
  }

  function unitAt(p) {
    let best = null;
    let bd = 12 * iconK;
    for (const u of state.units) {
      if (u.owner !== 0 || u.air) continue;
      const d = dist(u, p);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  function cityAt(p, r = 10) {
    let best = null;
    let bd = r;
    for (const c of state.cities) {
      const d = dist(c, p);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // p is a world point.
  function clickMap(p, shift = false) {
    const n = me();
    if (!n.alive) return;
    if (state.placing) {
      if (build(0, state.placing, p)) {
        Sound.build();
        if (n.credits < UNITS[state.placing].cost) state.placing = null;
      } else {
        const issue = placeIssue(0, state.placing, p);
        log(issue || `Not enough credits for a ${UNITS[state.placing].name.toLowerCase()}`, '#f87171');
        Sound.bad();
      }
      return;
    }
    const u = state.selected;
    if (u && !u.dead && state.action) {
      let ok = false;
      if (state.action === 'fighter' || state.action === 'bomber') ok = launchPlane(u, state.action, p);
      else if (state.action === 'subfire') ok = fireSub(u, p);
      if (ok) {
        Sound.click();
        if (state.action === 'bomber' || (state.action === 'subfire' && u.missiles <= 0)) state.action = null;
      } else Sound.bad();
      return;
    }
    // Shift-click: every ready silo fires at the target.
    if (shift && state.defcon === 1 && readySilos(0).length) {
      const k = fireSalvo(0, p);
      log(`Salvo: ${k} missile${k === 1 ? '' : 's'} away`, '#38bdf8');
      return;
    }
    const hit = unitAt(p);
    if (hit && hit !== u) {
      state.selected = hit;
      state.action = null;
      Sound.click();
      return;
    }
    if (!u || u.dead) {
      state.selected = null;
      return;
    }
    if (u.type === 'silo') {
      // Fire from this silo, or from the nearest other silo that is ready.
      const silos = readySilos(0);
      silos.sort((a, b) => (a === u ? -1 : b === u ? 1 : dist(a, p) - dist(b, p)));
      if (state.defcon > 1) log('Missiles can only be launched at DEFCON 1', '#f87171');
      else if (!silos.length) log(u.mode === 'launch' ? 'No silo is ready to fire yet' : 'Switch silos to launch mode first', '#f87171');
      else if (fireSilo(silos[0], p)) return;
      Sound.bad();
      return;
    }
    if (u.type === 'army') {
      const c = cityAt(p, 14);
      if (c && c.owner !== 0) {
        if (invade(u, c)) Sound.click();
        else {
          log(state.defcon > 3 ? 'Invasions start at DEFCON 3' : 'That city is too far away to invade', '#f87171');
          Sound.bad();
        }
        return;
      }
    }
    if (moveUnit(u, p)) Sound.click();
    else if (['fleet', 'sub', 'army'].includes(u.type)) Sound.bad();
    else state.selected = null;
  }

  function cycleSilo(dir) {
    const silos = state.units.filter((u) => u.owner === 0 && u.type === 'silo').sort((a, b) => a.x - b.x || a.y - b.y);
    if (!silos.length) {
      log('You have no silos yet', '#f87171');
      Sound.bad();
      return;
    }
    const i = silos.indexOf(state.selected);
    const next = silos[(((i < 0 && dir < 0 ? 0 : i) + dir) % silos.length + silos.length) % silos.length];
    state.selected = next;
    state.placing = null;
    state.action = null;
    focusOn(next);
    Sound.click();
  }

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (!state) return;
    const p = toCanvas(e);
    setPointer(p);
    input.over = true;
    input.shift = e.shiftKey;
    pointers.set(e.pointerId, p);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; ignore if unsupported.
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: camGoal.z, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      drag = null;
      return;
    }
    if (pointers.size > 2) return;
    if (e.button === 0) {
      const hit = hitTest(p.x, p.y);
      if (hit) {
        if (hit.id === 'rp:seek') {
          seekTo(p.x);
          drag = { seek: true };
        } else if (hit.id === 'minimap') {
          jumpMinimap(p);
          drag = { minimap: true };
        } else activate(hit);
        return;
      }
    }
    if (!['playing', 'paused', 'replay'].includes(state.mode)) return;
    drag = { x: p.x, y: p.y, lx: p.x, ly: p.y, button: e.button, moved: false, touch: e.pointerType === 'touch' };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    setPointer(p);
    input.over = true;
    input.shift = e.shiftKey;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
      zoomAt(mid.x, mid.y, (pinch.z * d) / pinch.d, true);
      pinch.mid = mid;
      tutMoved = true;
      return;
    }
    if (!drag) return;
    if (drag.seek) seekTo(p.x);
    else if (drag.minimap) jumpMinimap(p);
    else {
      if (!drag.moved && Math.hypot(p.x - drag.x, p.y - drag.y) > (drag.touch ? 10 : 5)) drag.moved = true;
      if (drag.moved) {
        panBy(p.x - drag.lx, p.y - drag.ly);
        drag.lx = p.x;
        drag.ly = p.y;
        if (cam.z > 1) tutMoved = true;
      }
    }
  });

  function endPointer(e, cancel) {
    pointers.delete(e.pointerId);
    // A finger leaves no cursor behind: drop hover ghosts and tooltips.
    if (e.pointerType === 'touch') setTimeout(() => { if (!pointers.size) input.over = false; }, 0);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      drag = null;
      return;
    }
    const d = drag;
    drag = null;
    if (!d || cancel || d.seek || d.minimap || d.moved || !state || state.mode !== 'playing') return;
    const p = toCanvas(e);
    if (d.button === 2) cancelOrders();
    else if (d.button === 0 && !overHud(p.x, p.y)) clickMap(toWorld(p), e.shiftKey);
  }

  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (!pointers.has(e.pointerId)) {
      input.over = false;
      hoverCity = null;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!state || !['playing', 'paused', 'replay'].includes(state.mode)) return;
    e.preventDefault();
    const p = toCanvas(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    zoomAt(p.x, p.y, camGoal.z * Math.exp(-clamp(dy, -200, 200) * 0.0022));
    tutMoved = true;
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !state) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    input.shift = e.shiftKey;
    const viewing = ['playing', 'paused', 'replay'].includes(state.mode);
    if (k === 'm') Sound.muted = !Sound.muted;
    else if (k === 'f') toggleFullscreen();
    else if (viewing && (k === 'home' || k === '0')) resetView();
    else if (viewing && (k === '+' || k === '=' || k === '-')) zoomAt(W / 2, H / 2, camGoal.z * (k === '-' ? 1 / 1.3 : 1.3));
    else if (viewing && k.startsWith('arrow') && cam.z > 1.01) {
      e.preventDefault();
      const s = 60;
      panBy(k === 'arrowleft' ? s : k === 'arrowright' ? -s : 0, k === 'arrowup' ? s : k === 'arrowdown' ? -s : 0);
    } else if (state.mode === 'replay') {
      if (k === 'escape') exitReplay();
      else if (k === ' ' || k === 'p') {
        e.preventDefault();
        activate({ id: 'rp:play' });
      }
    } else if (k === 'p' || (k === 'escape' && !state.placing && !state.action && !state.selected)) togglePause();
    else if (state.mode !== 'playing') return;
    else if (k === 'escape') cancelOrders();
    else if (k === 'tab') {
      e.preventDefault();
      cycleSilo(e.shiftKey ? -1 : 1);
    } else if (k === 'l') {
      const u = state.selected;
      if (u && u.type === 'silo' && setSiloMode(u, u.mode === 'launch' ? 'defend' : 'launch')) Sound.click();
      else Sound.bad();
    } else if (k >= '1' && k <= '4') state.speed = SPEEDS[Number(k) - 1];
    else {
      const type = BUILD_ORDER.find((t) => UNITS[t].key.toLowerCase() === k);
      if (type) activate({ id: `build:${type}`, type });
    }
  });
  document.addEventListener('keyup', (e) => {
    input.shift = e.shiftKey;
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !state || AUTOPLAY) return;
    if (state.mode === 'playing') togglePause();
    else if (state.mode === 'replay') replay.playing = false;
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  function render(real) {
    const s = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!state) return;
    const now = fx.now;
    updateCamera(real);
    setPointer({ x: input.mx, y: input.my });
    hoverCity = input.over && state.mode !== 'replay' ? cityAt({ x: input.wx, y: input.wy }, 9 * iconK) : null;
    const key = `${canvas.width}x${canvas.height}|${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.z.toFixed(3)}`;
    if (!background || key !== bgKey) {
      background = makeBackground();
      bgKey = key;
    }
    let ox = 0;
    let oy = 0;
    if (fx.shake > 0.05) {
      ox = rand(-1, 1) * fx.shake;
      oy = rand(-1, 1) * fx.shake;
      ctx.fillStyle = '#01040b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(background, ox * s, oy * s);
    const k = s * cam.z;
    ctx.setTransform(k, 0, 0, k, (ox - cam.x * cam.z) * s, (oy - cam.y * cam.z) * s);
    if (state.mode === 'replay') drawReplayWorld(now);
    else drawWorld(now);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawScreenFx(now);
    if (hudHidden) return;
    if (state.mode === 'replay') drawReplayHud(now);
    else drawHud(now);
  }

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    fx.now = now / 1000;
    if (state && state.mode === 'playing') {
      if (state.tut !== null) checkTutorial();
      if (state.tut === null) {
        let left = real * SPEED * state.speed;
        while (left > 0) {
          const dt = Math.min(1 / 30, left);
          step(dt);
          left -= dt;
        }
      }
      if (state.selected && state.selected.dead) {
        state.selected = null;
        state.action = null;
      }
      if (state.over) {
        state.endT -= real;
        if (state.endT <= 0) finish();
      }
    } else if (state && state.mode === 'replay' && replay.playing) {
      replay.t = Math.min(replay.end, replay.t + real * replay.speed);
      if (replay.t >= replay.end) replay.playing = false;
    }
    fx.shake = fx.shake > 0.05 ? fx.shake * Math.exp(-real * 5) : 0;
    fx.flash *= Math.exp(-real * 7);
    fx.booms = fx.booms.filter((b) => fx.now - b.at < BOOM_LIFE[b.kind]);
    if (fx.booms.length > 160) fx.booms.splice(0, fx.booms.length - 160);
    fx.pings = fx.pings.filter((p) => fx.now - p.at < 0.6);
    render(real);
    requestAnimationFrame(frame);
  }

  // Plays a whole game with bots in every seat; returns a summary.
  function simulate(opts = {}) {
    const keep = state;
    simulating = true;
    let out;
    try {
      newGame({ ...opts, bot: true });
      while (!state.over && state.t < END + 5) step(1 / 10);
      out = {
        t: Math.round(state.t),
        nations: state.nations.map((n) => ({ r: n.region, persona: n.persona, score: n.score, pop: Math.round(popOf(n.id)), kills: Math.round(n.kills), fired: n.fired, units: state.units.filter((u) => u.owner === n.id).length })),
        launches: state.rec.missiles.length,
        blasts: state.rec.blasts.length,
        events: state.events.length,
      };
    } finally {
      simulating = false;
      state = keep;
      background = null;
      landDots = null;
    }
    return out;
  }

  // Hooks for automated testing (?autoplay plays with a bot).
  window.__nk = {
    get state() { return state; },
    start,
    step,
    build,
    simulate,
    canPlace,
    placeIssue,
    setSiloMode,
    fireSilo,
    fireSalvo,
    newGame,
    finish,
    startReplay,
    exitReplay,
    replay,
    cam,
    zoomAt,
    resetView,
    toWorld,
    toScreen,
    fx,
    save,
    hud(on) { hudHidden = !on; },
    skipTutorial() { if (state && state.tut !== null) endTutorial(); },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
