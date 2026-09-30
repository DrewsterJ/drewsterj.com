'use strict';

// Nameless Nuke: a cold-war strategy game on a glowing world map. Lead one
// continent, build silos, radar, airbases, fleets, submarines, armies and
// satellites while the DEFCON level counts down, then survive the exchange.
// Score for enemy casualties, lose score for your own. Everything is drawn
// on one canvas.

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

  // Unit types. cost, vision (px), speed (px/s), and what they carry.
  const UNITS = {
    silo: { name: 'Missile silo', cost: 60, vision: 40, key: 'S', desc: 'Holds 6 missiles. Shoots down incoming missiles and bombers while in defend mode.' },
    radar: { name: 'Radar', cost: 25, vision: 165, key: 'R', desc: 'Reveals enemy units and missiles in a wide circle.' },
    airbase: { name: 'Airbase', cost: 50, vision: 50, key: 'B', desc: 'Launches fighters (scout, intercept) and bombers (carry a nuke).' },
    army: { name: 'Army', cost: 20, vision: 45, speed: 16, key: 'A', desc: 'Defends your cities. From DEFCON 3 it can invade a neighbouring continent’s city.' },
    fleet: { name: 'Battle fleet', cost: 40, vision: 95, speed: 22, key: 'F', desc: 'Moves by sea. Sinks enemy ships and shoots down missiles.' },
    sub: { name: 'Submarine', cost: 55, vision: 40, speed: 18, key: 'U', desc: 'Hidden unless ships come close. Carries 3 short-range missiles.' },
    satellite: { name: 'Satellite', cost: 90, vision: 115, speed: 34, key: 'T', desc: 'Orbits the planet and reveals everything beneath it.' },
  };
  const BUILD_ORDER = ['silo', 'radar', 'airbase', 'army', 'fleet', 'sub', 'satellite'];

  const NATIONS = [
    { name: 'You', color: '#38bdf8' },
    { name: 'Crimson', color: '#f43f5e' },
    { name: 'Verdant', color: '#4ade80' },
    { name: 'Amber', color: '#fbbf24' },
    { name: 'Violet', color: '#c084fc' },
    { name: 'Ivory', color: '#e2e8f0' },
  ];

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const SPEED = Math.min(64, Math.max(0.25, Number(params.get('speed')) || 1));

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
      cities: [['Moscow', 37.6, 55.8, 17], ['St Petersburg', 30.8, 59.9, 5], ['Novosibirsk', 83, 55, 2], ['Yekaterinburg', 60.6, 56.8, 2], ['Kazan', 49, 55.8, 1.5], ['Omsk', 73.4, 55, 1.5], ['Irkutsk', 104.3, 53.5, 1], ['Yakutsk', 129.7, 62, 1], ['Khabarovsk', 136, 50.5, 1]],
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

  function formatTime(t) {
    t = Math.max(0, Math.ceil(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  const DEFAULT_SAVE = { region: 'na', rivals: 3, games: 0, wins: 0, best: null };

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

    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.05)); },
    build() { this.play('build', 0.05, () => { this.tone(520, 0.06, 'square', 0.03); this.tone(780, 0.08, 'square', 0.025, null, 0.06); }); },
    bad() { this.play('bad', 0.2, () => this.tone(160, 0.14, 'square', 0.03)); },
    launch() { this.play('launch', 0.15, () => { this.noise(0.7, 0.08, 900); this.tone(220, 0.6, 'sawtooth', 0.02, 660); }); },
    boom() { this.play('boom', 0.1, () => { this.noise(1.4, 0.3, 380); this.tone(70, 1.1, 'sine', 0.22, 28); }); },
    intercept() { this.play('icpt', 0.08, () => this.tone(1400, 0.08, 'square', 0.02, 700)); },
    gun() { this.play('gun', 0.12, () => this.noise(0.06, 0.05, 3000)); },
    alarm() {
      this.play('alarm', 1.5, () => [0, 0.35, 0.7].forEach((d) => this.tone(880, 0.25, 'square', 0.04, 660, d)));
    },
    defcon() {
      this.play('defcon', 1, () => [440, 330].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, null, i * 0.4)));
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

  function newGame(opts = {}) {
    const home = opts.region || save.region;
    const rivals = clamp(opts.rivals ?? save.rivals, 1, 5);
    const others = shuffle(REGION_IDS.filter((r) => r !== home)).slice(0, rivals);
    const regions = [home, ...others];
    state = {
      mode: 'playing',
      t: 0,
      speed: 1,
      defcon: 5,
      nations: regions.map((r, k) => ({
        id: k,
        region: r,
        name: k === 0 ? 'You' : NATIONS[k].name,
        color: NATIONS[k].color,
        credits: START_CREDITS,
        kills: 0,
        losses: 0,
        score: 0,
        alive: true,
        ai: k > 0 || AUTOPLAY || opts.bot ? { think: rand(0.5, 2), grudge: {}, nukeAt: rand(4, 30), launched: false } : null,
      })),
      cities: [],
      units: [],
      missiles: [],
      booms: [],
      craters: [],
      tracers: [],
      log: [],
      placing: null,
      selected: null,
      action: null,
      over: false,
      endT: 0,
    };
    for (const n of state.nations) {
      for (const c of REGIONS[n.region].cityList) {
        state.cities.push({ id: nextId++, ...c, pop0: c.pop, region: n.region, owner: n.id, garrison: 15 });
      }
    }
    background = null;
  }

  const me = () => state.nations[0];
  const nationOf = (region) => state.nations.find((n) => n.region === region);
  const popOf = (id) => state.cities.reduce((s, c) => s + (c.owner === id ? c.pop : 0), 0);

  function log(text, color = '#cbd5e1') {
    state.log.unshift({ text, color, t: 12 });
    if (state.log.length > 6) state.log.length = 6;
  }

  // ---------------------------------------------------------------------------
  // Building
  // ---------------------------------------------------------------------------

  function canPlace(owner, type, pt) {
    const n = state.nations[owner];
    const R = REGIONS[n.region];
    if (type === 'satellite') return state.units.filter((u) => u.owner === owner && u.type === 'satellite').length < 3;
    if (type === 'fleet' || type === 'sub') {
      if (isLand(pt)) return false;
      return distToShapes(pt, R.shapes) < 55;
    }
    if (!R.shapes.some((s) => inPoly(pt, s))) return false;
    if (distToShapes(pt, R.shapes) < 4) return false;
    return !state.units.some((u) => u.owner === owner && !u.air && ['silo', 'radar', 'airbase'].includes(u.type) && dist(u, pt) < 14);
  }

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

  function launchMissile(owner, from, target, kind) {
    const d = dist(from, target);
    const speed = kind === 'sub' ? 70 : 52;
    // Arc toward the pole for a globe-ish flight path.
    const mx = (from.x + target.x) / 2;
    const my = (from.y + target.y) / 2 - Math.min(160, d * 0.35);
    state.missiles.push({ id: nextId++, owner, sx: from.x, sy: from.y, cx: mx, cy: my, tx: target.x, ty: target.y, t: 0, dur: d / speed + 1.5, trail: [], x: from.x, y: from.y });
    if (owner === 0) Sound.launch();
    else if (state.nations[0].alive) Sound.alarm();
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

  function step(dt) {
    state.t += dt;
    const was = state.defcon;
    state.defcon = defconAt(state.t);
    if (state.defcon !== was) {
      log(`DEFCON ${state.defcon}${state.defcon === 3 ? ': conventional war allowed' : state.defcon === 1 ? ': nuclear launch authorised' : ''}`, defconColor(state.defcon));
      Sound.defcon();
    }

    for (const n of state.nations) {
      if (!n.alive) continue;
      n.credits += popOf(n.id) * INCOME * dt;
    }

    for (const u of state.units) updateUnit(u, dt);
    updateMissiles(dt);
    state.units = state.units.filter((u) => !u.dead);

    for (const b of state.booms) b.t += dt;
    state.booms = state.booms.filter((b) => b.t < 2.5);
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
        log(`${n.name === 'You' ? 'Your nation has' : `${n.name} has`} fallen`, n.color);
      }
    }

    if (!state.over) {
      const alive = state.nations.filter((n) => n.alive);
      const armed = state.missiles.length || state.units.some((u) => (u.type === 'silo' || u.type === 'sub') && u.missiles > 0);
      if (state.t >= END || alive.length <= 1 || (state.defcon === 1 && state.t > DEFCON_AT[1] + 90 && !armed)) {
        state.over = true;
        state.endT = 2;
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
        const hitMissile = (m) => {
          m.dead = true;
          state.booms.push({ x: m.x, y: m.y, t: 0, small: true });
          Sound.intercept();
        };
        if (shoot(u, enemyMissiles(), 150, 0.3, hitMissile, color)) u.cd = 1.2;
        else if (shoot(u, enemyPlanes(), 140, 0.4, (p) => { p.dead = true; }, color)) u.cd = 1.2;
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
        else if (shoot(u, enemyMissiles(), 60, 0.18, (m) => { m.dead = true; state.booms.push({ x: m.x, y: m.y, t: 0, small: true }); }, color)) u.cd = 0.8;
        else if (shoot(u, enemyPlanes(), 65, 0.3, (p) => { p.dead = true; }, color)) u.cd = 0.8;
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
      // Fighting in the streets costs lives.
      const killed = city.pop * 0.3;
      city.pop -= killed;
      before.losses += killed;
      state.nations[u.owner].kills += killed;
      city.owner = u.owner;
      city.garrison = u.str;
      u.dead = true;
      log(`${state.nations[u.owner].name} captured ${city.name} from ${before.name}`, state.nations[u.owner].color);
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
      if (shoot(p, planes, 45, 0.35, (o) => { o.dead = true; }, state.nations[p.owner].color)) p.cd = 1;
    }
  }

  function kill(u) {
    if (u.dead) return;
    u.dead = true;
    state.booms.push({ x: u.x, y: u.y, t: 0, small: true });
    if (u.owner === 0) log(`Your ${UNITS[u.type] ? UNITS[u.type].name.toLowerCase() : u.type} was destroyed`, '#f87171');
  }

  function updateMissiles(dt) {
    for (const m of state.missiles) {
      if (m.dead) continue;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const a = (1 - k) * (1 - k);
      const b = 2 * (1 - k) * k;
      const c = k * k;
      m.x = a * m.sx + b * m.cx + c * m.tx;
      m.y = a * m.sy + b * m.cy + c * m.ty;
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 40) m.trail.shift();
      if (k >= 1) {
        m.dead = true;
        detonate(m.tx, m.ty, m.owner);
      }
    }
    state.missiles = state.missiles.filter((m) => !m.dead);
  }

  function detonate(x, y, owner) {
    state.booms.push({ x, y, t: 0 });
    state.craters.push({ x, y });
    Sound.boom();
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
      if (killed > 0.5) log(`${c.name} hit: ${killed.toFixed(1)}M dead`, victim.id === 0 ? '#f87171' : attacker.color);
    }
    for (const u of state.units) {
      if (u.dead || u.type === 'satellite') continue;
      if (Math.hypot(u.x - x, u.y - y) < BLAST) kill(u);
    }
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  const AI_WANT = { silo: 6, radar: 2, airbase: 1, army: 4, fleet: 3, sub: 1, satellite: 1 };

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

  function aiThink(n) {
    const own = state.units.filter((u) => u.owner === n.id);
    const count = (t) => own.filter((u) => u.type === t).length;

    // Build toward a rough wish list; past it, mostly more silos and ships.
    for (let guard = 0; guard < 4; guard++) {
      let best = null;
      let bestK = Infinity;
      for (const [t, want] of Object.entries(AI_WANT)) {
        const k = (count(t) + rand(0, 0.6)) / want;
        if (k < bestK && n.credits >= UNITS[t].cost) {
          bestK = k;
          best = t;
        }
      }
      if (!best) break;
      if (bestK >= 1) {
        if (Math.random() < 0.5) break;
        best = pick(['silo', 'silo', 'fleet', 'army']);
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
      if (!n.ai.foe || !state.nations[n.ai.foe].alive) {
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
      // Fleets sail toward the enemy coast.
      for (const f of own.filter((u) => u.type === 'fleet' || u.type === 'sub')) {
        if (f.dest || Math.random() > 0.3) continue;
        const target = pick(state.cities.filter((c) => c.owner === foe.id)) || null;
        if (!target) continue;
        for (let k = 0; k < 25; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = f.type === 'sub' ? rand(90, 200) : rand(50, 120);
          const p = { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r };
          if (p.x < 5 || p.x > W - 5 || p.y < 50 || p.y > H - 10) continue;
          if (moveUnit(f, p)) break;
        }
      }
      // Armies invade a weakly held neighbouring city.
      for (const a of own.filter((u) => u.type === 'army' && !u.target && u.str > 7)) {
        if (Math.random() > 0.15) continue;
        const targets = state.cities.filter((c) => c.owner !== n.id && (ADJ[n.region].includes(c.region) || c.region === n.region));
        targets.sort((p, q) => defence(p) + dist(a, p) / 40 - (defence(q) + dist(a, q) / 40));
        if (targets[0] && defence(targets[0]) < a.str * 1.1) invade(a, targets[0]);
      }
    }

    if (state.defcon === 1) {
      const since = state.t - DEFCON_AT[1];
      const silos = own.filter((u) => u.type === 'silo');
      if (!n.ai.launched && since > n.ai.nukeAt) {
        n.ai.launched = true;
        // Keep a couple of silos on defence.
        const keep = Math.max(1, Math.floor(silos.length * 0.3));
        silos.slice(keep).forEach((s) => setSiloMode(s, 'launch'));
      }
      // Retaliate: if we are being hit, switch everything to launch.
      if (worst > 5) silos.forEach((s) => s.missiles > 0 && setSiloMode(s, 'launch'));
      const targets = nukeTargets(n, foe);
      for (const s of silos) {
        if (s.mode === 'launch' && s.missiles > 0 && s.cd <= 0 && targets.length) fireSilo(s, pickTarget(targets));
        if (s.mode === 'launch' && s.missiles === 0) setSiloMode(s, 'defend');
      }
      for (const s of own.filter((u) => u.type === 'sub' && u.missiles > 0 && u.cd <= 0)) {
        const inRange = targets.filter((t) => dist(s, t) < 270);
        if (inRange.length) fireSub(s, pickTarget(inRange));
      }
      for (const b of own.filter((u) => u.type === 'airbase' && u.bombers > 0)) {
        const inRange = targets.filter((t) => dist(b, t) < 380);
        if (inRange.length && Math.random() < 0.5) launchPlane(b, 'bomber', pickTarget(inRange));
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
      if (u.owner !== foe.id || u.dead || !['silo', 'airbase', 'radar'].includes(u.type)) continue;
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
  // Canvas
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let background = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

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
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }

  function drawGlow(x, y, r, color, g = ctx) {
    g.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  }

  // Ocean, grid and continents never change: draw them once per game.
  function makeBackground() {
    const S = 2;
    const c = document.createElement('canvas');
    c.width = W * S;
    c.height = H * S;
    const g = c.getContext('2d');
    g.scale(S, S);
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#040b17');
    sea.addColorStop(1, '#020610');
    g.fillStyle = sea;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(56,189,248,0.07)';
    g.lineWidth = 1;
    for (let lon = -160; lon <= 180; lon += 20) {
      const x = proj([lon, 0]).x;
      g.beginPath();
      g.moveTo(x, 40);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      const y = proj([0, lat]).y;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    const outline = (shapes, color, fill) => {
      for (const s of shapes) {
        g.beginPath();
        s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = rgba(color, 0.25);
        g.lineWidth = 5;
        g.lineJoin = 'round';
        g.stroke();
        g.strokeStyle = rgba(color, 0.9);
        g.lineWidth = 1.3;
        g.stroke();
      }
    };
    outline(WILD, '#64748b', 'rgba(100,116,139,0.06)');
    for (const id of REGION_IDS) {
      const n = nationOf(id);
      const color = n ? n.color : '#64748b';
      outline(REGIONS[id].shapes, color, n ? rgba(color, n.id === 0 ? 0.1 : 0.07) : 'rgba(100,116,139,0.05)');
    }
    return c;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function drawUnitIcon(u, color, alpha = 1) {
    const { x, y } = u;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    if (u.type === 'silo') {
      const launch = u.mode === 'launch';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      if (launch) {
        ctx.fillStyle = rgba('#ef4444', 0.35);
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
        ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + (1 - u.switchT / 8) * Math.PI * 2);
        ctx.stroke();
      }
    } else if (u.type === 'radar') {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
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
      ctx.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2);
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
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(u.heading || 0);
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s, -s * 0.8);
      ctx.lineTo(-s * 0.5, 0);
      ctx.lineTo(-s, s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) return;
    if (!background) background = makeBackground();
    ctx.drawImage(background, 0, 0, W, H);
    const now = performance.now() / 1000;

    // Fallout.
    for (const c of state.craters) drawGlow(c.x, c.y, BLAST * 1.2, 'rgba(249,115,22,0.35)');

    // Your radar and satellite coverage.
    ctx.lineWidth = 1;
    for (const u of state.units) {
      if (u.owner !== 0 || !['radar', 'satellite'].includes(u.type)) continue;
      ctx.strokeStyle = 'rgba(56,189,248,0.18)';
      ctx.fillStyle = 'rgba(56,189,248,0.035)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, UNITS[u.type].vision, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Cities.
    ctx.textAlign = 'center';
    for (const c of state.cities) {
      const col = state.nations[c.owner].color;
      const r = 1.6 + Math.sqrt(Math.max(0, c.pop)) * 0.75;
      drawGlow(c.x, c.y, r * 3.2, rgba(col, 0.5));
      ctx.fillStyle = c.pop < 0.3 ? '#475569' : col;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (c.pop0 >= 6 || c === hoverCity) {
        ctx.fillStyle = rgba(col, 0.75);
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillText(c.name, c.x, c.y + r + 9);
      }
    }

    // Units you can see.
    for (const u of state.units) {
      if (!visibleUnit(0, u)) continue;
      const col = state.nations[u.owner].color;
      drawUnitIcon(u, col, u.owner === 0 || u.revealed > state.t || u.type === 'satellite' ? 1 : 0.85);
      if (state.selected === u) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (u.owner === 0 && u.dest && (u.type === 'fleet' || u.type === 'sub' || u.type === 'army')) {
        ctx.strokeStyle = 'rgba(56,189,248,0.4)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(u.dest.x, u.dest.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Gunfire.
    for (const tr of state.tracers) {
      ctx.globalAlpha = tr.t * 4;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Missiles.
    for (const m of state.missiles) {
      const col = state.nations[m.owner].color;
      ctx.strokeStyle = rgba(col, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      m.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // Predicted path for missiles heading your way.
      ctx.strokeStyle = rgba(col, 0.15);
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.quadraticCurveTo(m.cx, m.cy, m.tx, m.ty);
      ctx.stroke();
      ctx.setLineDash([]);
      drawGlow(m.x, m.y, 9, '#fff');
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Explosions.
    for (const b of state.booms) {
      const k = b.t / (b.small ? 0.6 : 2.5);
      if (k > 1) continue;
      const R = b.small ? 10 : BLAST * 1.6;
      ctx.globalAlpha = 1 - k;
      drawGlow(b.x, b.y, R * (0.4 + k), b.small ? '#fde68a' : '#fff7ed');
      ctx.strokeStyle = b.small ? '#fde68a' : '#fb923c';
      ctx.lineWidth = b.small ? 1 : 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, R * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawPlacement();
    drawHud(now);
  }

  function drawPlacement() {
    if (!input.over || state.mode !== 'playing') return;
    const p = { x: input.mx, y: input.my };
    if (state.placing) {
      const ok = canPlace(0, state.placing, p) && me().credits >= UNITS[state.placing].cost;
      drawUnitIcon({ type: state.placing, x: p.x, y: p.y, mode: 'defend' }, ok ? '#38bdf8' : '#ef4444', 0.8);
      ctx.strokeStyle = ok ? 'rgba(56,189,248,0.3)' : 'rgba(239,68,68,0.3)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, UNITS[state.placing].vision, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.action) {
      const u = state.selected;
      const range = state.action === 'bomber' ? 400 : state.action === 'subfire' ? 280 : 0;
      if (range && u) {
        ctx.strokeStyle = 'rgba(239,68,68,0.35)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const col = state.action === 'fighter' ? '#38bdf8' : '#ef4444';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, state.action === 'fighter' ? 8 : BLAST, 0, Math.PI * 2);
      ctx.moveTo(p.x - 14, p.y);
      ctx.lineTo(p.x + 14, p.y);
      ctx.moveTo(p.x, p.y - 14);
      ctx.lineTo(p.x, p.y + 14);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  const BUILD = { x: 8, y: 46, w: 128, h: 32, gap: 4 };
  const SPEEDS = [1, 2, 4, 8];

  function buildButtons() {
    return BUILD_ORDER.map((type, k) => ({ id: `build:${type}`, type, x: BUILD.x, y: BUILD.y + k * (BUILD.h + BUILD.gap), w: BUILD.w, h: BUILD.h }));
  }

  function topButtons() {
    const paused = state && state.mode === 'paused';
    const out = SPEEDS.map((s, k) => ({ id: `speed:${s}`, s, label: `${s}×`, x: 560 + k * 38, y: 6, w: 34, h: 26 }));
    return out.concat([
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: W - 118 + k * 38, y: 6, w: 34, h: 26 })));
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
      add('allsilos', 'All silos: launch', state.defcon > 1);
    } else if (u.type === 'airbase') {
      add('fighter', `Fighter (${u.fighters})`, u.fighters <= 0 || state.defcon > 4);
      add('bomber', `Bomber (${u.bombers})`, u.bombers <= 0 || state.defcon > 1);
    } else if (u.type === 'sub') {
      add('subfire', `Launch (${u.missiles})`, u.missiles <= 0 || state.defcon > 1);
    }
    return out;
  }

  function hitTest(x, y) {
    if (!state) return null;
    for (const b of topButtons()) if (inside(b, x, y)) return b;
    if (state.mode !== 'playing' && state.mode !== 'paused') return null;
    for (const b of buildButtons()) if (inside(b, x, y)) return b;
    for (const b of actionButtons()) if (inside(b, x, y)) return b;
    return null;
  }

  function panel(x, y, w, h) {
    roundRect(x, y, w, h, 8);
    ctx.fillStyle = 'rgba(2,8,20,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function button(b, hover, on) {
    roundRect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = on ? 'rgba(56,189,248,0.35)' : b.off ? 'rgba(255,255,255,0.03)' : hover ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = on ? '#38bdf8' : 'rgba(56,189,248,0.3)';
    ctx.stroke();
    ctx.fillStyle = b.off ? 'rgba(226,232,240,0.35)' : '#e2e8f0';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  }

  function drawHud(now) {
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    const n = me();

    // Top bar.
    ctx.fillStyle = 'rgba(2,8,20,0.9)';
    ctx.fillRect(0, 0, W, 38);
    ctx.strokeStyle = 'rgba(56,189,248,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 38.5);
    ctx.lineTo(W, 38.5);
    ctx.stroke();
    const dc = state.defcon;
    const blink = dc === 1 && Math.floor(now * 2) % 2;
    roundRect(8, 6, 118, 26, 5);
    ctx.fillStyle = blink ? '#7f1d1d' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = defconColor(dc);
    ctx.stroke();
    ctx.fillStyle = defconColor(dc);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`DEFCON ${dc}`, 67, 24);
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const next = dc > 1 ? `DEFCON ${dc - 1} in ${formatTime(DEFCON_AT[dc - 1] - state.t)}` : `Ceasefire in ${formatTime(END - state.t)}`;
    ctx.fillText(next, 136, 24);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${Math.floor(n.credits)} credits`, 300, 24);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`+${(popOf(0) * INCOME).toFixed(1)}/s`, 392, 24);
    ctx.fillText(`${popOf(0).toFixed(1)}M people`, 450, 24);
    for (const b of topButtons()) button(b, hover && hover.id === b.id, b.s === state.speed);

    // Build panel.
    panel(4, 42, 136, BUILD_ORDER.length * (BUILD.h + BUILD.gap) + 8);
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
      drawUnitIcon({ type: b.type, x: b.x + 16, y: b.y + b.h / 2, mode: 'defend', heading: 0 }, afford ? '#38bdf8' : '#475569');
      ctx.textAlign = 'left';
      ctx.fillStyle = afford ? '#e2e8f0' : '#64748b';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(def.name, b.x + 32, b.y + 14);
      ctx.fillStyle = afford ? '#fde68a' : '#64748b';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${def.cost} · ${def.key}`, b.x + 32, b.y + 27);
    }

    // Nations.
    const ns = [...state.nations].sort((a, b) => b.score - a.score);
    const nh = 16 + ns.length * 30;
    panel(W - 184, 42, 180, nh);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText('PEOPLE   SCORE', W - 12, 54);
    ns.forEach((o, k) => {
      const y = 70 + k * 30;
      ctx.globalAlpha = o.alive ? 1 : 0.45;
      ctx.fillStyle = o.color;
      ctx.fillRect(W - 176, y - 9, 4, 22);
      ctx.textAlign = 'left';
      ctx.font = o.id === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(o.name, W - 166, y + 1);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(REGIONS[o.region].name, W - 166, y + 12);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${popOf(o.id).toFixed(0)}M`, W - 60, y + 5);
      ctx.fillStyle = o.color;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(String(o.score), W - 12, y + 5);
    });
    ctx.globalAlpha = 1;

    // Selection panel.
    const u = state.selected;
    if (u && !u.dead && u.owner === 0) {
      panel(146, H - 54, 142 + Math.max(1, actionButtons().length) * 138, 48);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(UNITS[u.type].name, 156, H - 34);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      let info = '';
      if (u.type === 'silo') info = u.switchT > 0 ? `Switching… ${Math.ceil(u.switchT)}s` : `${u.missiles} missiles`;
      else if (u.type === 'army') info = u.target ? `Invading · strength ${u.str.toFixed(0)}` : `Strength ${u.str.toFixed(0)} · click a city`;
      else if (u.type === 'fleet') info = `Hull ${Math.max(0, u.hp)} · click the sea`;
      else if (u.type === 'sub') info = `${u.missiles} missiles · click the sea`;
      else if (u.type === 'airbase') info = `${u.fighters} fighters · ${u.bombers} bombers`;
      else info = 'Watching';
      ctx.fillText(info, 156, H - 18);
      for (const b of actionButtons()) button(b, hover && hover.id === b.id, state.action === b.id);
    } else if (state.placing) {
      const def = UNITS[state.placing];
      panel(146, H - 54, 470, 48);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(`Place ${def.name.toLowerCase()} · ${def.cost} credits`, 156, H - 34);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(def.desc, 156, H - 18);
    }

    // Log.
    ctx.textAlign = 'right';
    state.log.forEach((l, k) => {
      ctx.globalAlpha = clamp(l.t / 2, 0, 1) * (1 - k * 0.12);
      ctx.fillStyle = l.color;
      ctx.font = k === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(l.text, W - 10, H - 12 - k * 17);
    });
    ctx.globalAlpha = 1;

    // City tooltip.
    if (hoverCity && !state.placing) {
      const c = hoverCity;
      const o = state.nations[c.owner];
      const text = `${c.name} · ${c.pop.toFixed(1)}M · ${o.name}`;
      ctx.font = '12px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 16;
      const tx = clamp(c.x - w / 2, 150, W - 190 - w);
      panel(tx, c.y - 34, w, 22);
      ctx.fillStyle = o.color;
      ctx.textAlign = 'left';
      ctx.fillText(text, tx + 8, c.y - 19);
    }
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay)
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

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
          <div class="row"><button type="button" class="primary" data-act="start">Start</button></div>
          ${save.games ? `<p class="help">Record: ${save.wins} won of ${save.games}${save.best !== null ? ` · best score ${save.best}` : ''}</p>` : ''}
          <p class="help">Pick a unit on the left, then click your land (or the sea near it) to build. Click a unit to give it orders. 1–4 set the game speed. This is a game: no real places are harmed.</p>
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div class="nk-panel">
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
        </div>`;
    } else if (kind === 'over') {
      const ns = [...state.nations].sort((a, b) => b.score - a.score);
      const won = ns[0].id === 0;
      const rows = ns.map((o, k) => `<tr><td>${k + 1}</td><td style="color:${o.color}">${o.name}</td><td>${REGIONS[o.region].name}</td><td>${popOf(o.id).toFixed(1)}M</td><td>${o.kills.toFixed(1)}M</td><td>${o.losses.toFixed(1)}M</td><td><b>${o.score}</b></td></tr>`).join('');
      overlay.innerHTML = `
        <div class="nk-panel">
          <h2>${won ? 'Victory' : 'Defeat'}</h2>
          <p>${won ? 'Your nation finished with the highest score.' : `${ns[0].name} finished with the highest score.`} There are no real winners in a nuclear war.</p>
          <table class="nk-table"><thead><tr><th></th><th>Nation</th><th>Continent</th><th>Alive</th><th>Killed</th><th>Lost</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>
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
    log('DEFCON 5: build your defences', defconColor(5));
  }

  function finish() {
    state.mode = 'over';
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

  function activate(b) {
    const u = state.selected;
    if (b.id === 'pause') togglePause();
    else if (b.id === 'mute') Sound.muted = !Sound.muted;
    else if (b.id === 'full') toggleFullscreen();
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
      for (const o of state.units) if (o.owner === 0 && o.type === 'silo' && o.missiles > 0) setSiloMode(o, 'launch');
      log('All silos switching to launch mode', '#f87171');
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
    } else if (b.dataset.act === 'start') start();
    else if (b.dataset.act === 'resume') togglePause();
    else if (b.dataset.act === 'menu') showMenu();
  });

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const input = { mx: W / 2, my: H / 2, over: false };
  let hoverCity = null;

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function unitAt(p) {
    let best = null;
    let bd = 12;
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

  function clickMap(p) {
    const n = me();
    if (!n.alive) return;
    if (state.placing) {
      if (build(0, state.placing, p)) {
        Sound.build();
        if (n.credits < UNITS[state.placing].cost) state.placing = null;
      } else Sound.bad();
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
      // Fire from this silo, or from any other silo that is ready.
      const silos = state.units.filter((o) => o.owner === 0 && o.type === 'silo' && o.mode === 'launch' && o.switchT <= 0 && o.missiles > 0 && o.cd <= 0);
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

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
    hoverCity = state ? cityAt(p, 8) : null;
  });
  canvas.addEventListener('pointerleave', () => {
    input.over = false;
    hoverCity = null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    if (e.button === 2) {
      state.placing = null;
      state.action = null;
      state.selected = null;
      return;
    }
    if (e.button !== 0) return;
    const hit = hitTest(p.x, p.y);
    if (hit) {
      activate(hit);
      return;
    }
    if (state && state.mode === 'playing' && p.y > 40) clickMap(p);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') Sound.muted = !Sound.muted;
    else if (k === 'f') toggleFullscreen();
    else if (k === 'p' || (k === 'escape' && !state.placing && !state.action && !state.selected)) togglePause();
    else if (!state || state.mode !== 'playing') return;
    else if (k === 'escape') {
      state.placing = null;
      state.action = null;
      state.selected = null;
    } else if (k >= '1' && k <= '4') state.speed = SPEEDS[Number(k) - 1];
    else {
      const type = BUILD_ORDER.find((t) => UNITS[t].key.toLowerCase() === k);
      if (type) activate({ id: `build:${type}`, type });
    }
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
      let left = real * SPEED * state.speed;
      while (left > 0) {
        const dt = Math.min(1 / 30, left);
        step(dt);
        left -= dt;
      }
      if (state.selected && state.selected.dead) {
        state.selected = null;
        state.action = null;
      }
      if (state.over) {
        state.endT -= real;
        if (state.endT <= 0) finish();
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  // Plays a whole game with bots in every seat; returns a summary.
  function simulate(opts = {}) {
    const keep = state;
    newGame({ ...opts, bot: true });
    while (!state.over && state.t < END + 5) step(1 / 10);
    const out = {
      t: Math.round(state.t),
      nations: state.nations.map((n) => ({ r: n.region, score: n.score, pop: Math.round(popOf(n.id)), kills: Math.round(n.kills), units: state.units.filter((u) => u.owner === n.id).length })),
    };
    state = keep;
    background = null;
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
    setSiloMode,
    fireSilo,
    newGame,
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
