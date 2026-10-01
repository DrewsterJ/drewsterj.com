'use strict';

// Nameless Slots: a five-reel gem slot machine with free spins, a treasure
// pick bonus, a prize wheel, a progressive jackpot, a daily gift wheel, a gem
// card album and achievements. Play gems only: no real money, nothing to buy.
// Everything is drawn on one canvas; there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const REELS = 5;
  const ROWS = 3;
  const CELL_W = 120;
  const CELL_H = 112;
  const REEL_X = 200;
  const REEL_Y = 86;
  const START_GEMS = 1000;
  const REFILL_GEMS = 1000;
  const BETS = [10, 20, 50, 100, 200, 500];
  const LINES = 10;
  const METER_MAX = 100; // paid spins to charge the Gem Wheel
  const FS_MULT = 2;
  const BIG_WIN = 15; // multiples of the bet for the big win celebrations
  const MEGA_WIN = 35;
  const EPIC_WIN = 80;
  const JP_SEED = 60; // the progressive jackpot restarts at 60× the bet...
  const JP_RATE = 0.03; // ...and every paid spin adds 3% of the bet to it
  const HOLD_AUTO = 0.55; // seconds to hold Spin before auto spin kicks in
  const HOLD_SPINS = 50;
  const ALBUM_BONUS = 10000;
  const SPRITE_SCALE = 1.35; // symbols are cached a little larger than drawn, for zooms
  const SAVE_KEY = 'nameless-slots';

  const params = new URLSearchParams(location.search);

  // pays[n] is the line win, in line bets, for n matching symbols from the left.
  const SYMBOLS = {
    ruby: { name: 'Ruby', pays: [0, 0, 0, 8, 20, 50], weight: [10, 10, 10, 10, 10] },
    sapphire: { name: 'Sapphire', pays: [0, 0, 0, 8, 20, 50], weight: [10, 10, 10, 10, 10] },
    emerald: { name: 'Emerald', pays: [0, 0, 0, 10, 30, 75], weight: [9, 9, 9, 9, 9] },
    amethyst: { name: 'Amethyst', pays: [0, 0, 0, 10, 30, 75], weight: [9, 9, 9, 9, 9] },
    crown: { name: 'Crown', pays: [0, 0, 0, 20, 60, 200], weight: [6, 6, 6, 6, 6] },
    seven: { name: 'Lucky 7', pays: [0, 0, 0, 30, 100, 400], weight: [4, 4, 4, 4, 4] },
    diamond: { name: 'Diamond', pays: [0, 0, 0, 45, 180, 720], weight: [3, 3, 3, 3, 3] },
    wild: { name: 'Wild', pays: [0, 0, 0, 70, 270, 1500], weight: [1, 2, 2, 2, 2] },
    orb: { name: 'Free Spins Orb', pays: [], weight: [1.8, 1.8, 1.8, 1.8, 1.8] },
    chest: { name: 'Treasure Chest', pays: [], weight: [1.5, 1.5, 1.5, 1.5, 1.5] },
  };
  const SYMBOL_IDS = Object.keys(SYMBOLS);
  // Orbs pay the total bet times this, and award free spins, by count.
  const ORB_PAY = [0, 0, 0, 2, 10, 50];
  const ORB_SPINS = [0, 0, 0, 8, 12, 20];
  const FS_RETRIGGER = 5;
  // Treasure Pick prizes, in multiples of the total bet.
  const CHEST_PRIZES = [1, 1, 2, 2, 3, 3, 5, 8, 15];
  // Gem Wheel slices, in multiples of the average bet while it charged.
  const WHEEL = [
    { label: '2×', mult: 2, color: '#7c3aed' },
    { label: '5×', mult: 5, color: '#0891b2' },
    { label: '2×', mult: 2, color: '#be185d' },
    { label: '10×', mult: 10, color: '#16a34a' },
    { label: '3×', mult: 3, color: '#7c3aed' },
    { label: '20×', mult: 20, color: '#ca8a04' },
    { label: '2×', mult: 2, color: '#0891b2' },
    { label: '8×', mult: 8, color: '#be185d' },
    { label: '5×', mult: 5, color: '#16a34a' },
    { label: 'FREE SPINS', fs: 8, color: '#0e7490' },
    { label: '12×', mult: 12, color: '#7c3aed' },
    { label: 'JACKPOT', color: '#eab308', jackpot: true },
  ];
  // The once-a-day gift wheel, in gems.
  const DAILY = [
    { label: '250', gems: 250, color: '#7c3aed' },
    { label: '500', gems: 500, color: '#0891b2' },
    { label: '300', gems: 300, color: '#be185d' },
    { label: '1,000', gems: 1000, color: '#16a34a' },
    { label: '250', gems: 250, color: '#7c3aed' },
    { label: '750', gems: 750, color: '#0891b2' },
    { label: '400', gems: 400, color: '#be185d' },
    { label: '2,500', gems: 2500, color: '#ca8a04' },
  ];

  // Rows are 0 (top) to 2 (bottom).
  const PAYLINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [1, 0, 1, 2, 1],
  ];
  const LINE_COLORS = ['#fde047', '#f472b6', '#67e8f9', '#86efac', '#fdba74', '#c4b5fd', '#fca5a5', '#5eead4', '#fcd34d', '#a5b4fc'];

  const TIERS = [
    null,
    { label: 'BIG WIN', color: '#fde047', deep: '#b45309', rate: 45 },
    { label: 'MEGA WIN', color: '#f472b6', deep: '#9d174d', rate: 75 },
    { label: 'EPIC WIN', color: '#67e8f9', deep: '#0e7490', rate: 110 },
    { label: 'JACKPOT', color: '#fbbf24', deep: '#b91c1c', rate: 120 },
  ];

  // Gem cards for the album, earned from bonus features.
  const RARITY = {
    common: { name: 'Common', weight: 10, color: '#d6d3d1' },
    rare: { name: 'Rare', weight: 4, color: '#38bdf8' },
    epic: { name: 'Epic', weight: 1.6, color: '#c084fc' },
    legendary: { name: 'Legendary', weight: 0.8, color: '#fbbf24' },
  };
  const CARDS = [
    { id: 'ruby-ember', name: 'Ruby Ember', art: 'ruby', rarity: 'common', bg: ['#4c0519', '#9f1239'] },
    { id: 'sapphire-tide', name: 'Sapphire Tide', art: 'sapphire', rarity: 'common', bg: ['#172554', '#1d4ed8'] },
    { id: 'emerald-grove', name: 'Emerald Grove', art: 'emerald', rarity: 'common', bg: ['#052e16', '#15803d'] },
    { id: 'amethyst-dusk', name: 'Amethyst Dusk', art: 'amethyst', rarity: 'common', bg: ['#2e1065', '#7e22ce'] },
    { id: 'midnight-ruby', name: 'Midnight Ruby', art: 'ruby', rarity: 'rare', bg: ['#020617', '#4c0519'] },
    { id: 'frost-sapphire', name: 'Frost Sapphire', art: 'sapphire', rarity: 'rare', bg: ['#e0f2fe', '#0369a1'] },
    { id: 'royal-crown', name: 'Royal Crown', art: 'crown', rarity: 'rare', bg: ['#3b0764', '#a21caf'] },
    { id: 'lucky-seven', name: 'Lucky Seven', art: 'seven', rarity: 'rare', bg: ['#1c1917', '#57534e'] },
    { id: 'treasure-chest', name: 'Treasure Chest', art: 'chest', rarity: 'rare', bg: ['#422006', '#a16207'] },
    { id: 'starlight-orb', name: 'Starlight Orb', art: 'orb', rarity: 'epic', bg: ['#083344', '#0e7490'] },
    { id: 'prism-wild', name: 'Prism Wild', art: 'wild', rarity: 'epic', bg: ['#4a044e', '#db2777'] },
    { id: 'gem-wheel', name: 'Gem Wheel', art: 'wheel', rarity: 'epic', bg: ['#1e1b4b', '#4338ca'] },
    { id: 'sun-diamond', name: 'Sun Diamond', art: 'diamond', rarity: 'epic', bg: ['#7c2d12', '#f59e0b'] },
    { id: 'golden-seven', name: 'Golden Seven', art: 'seven', rarity: 'legendary', bg: ['#713f12', '#facc15'] },
    { id: 'crown-jewel', name: 'Crown Jewel', art: 'crown', rarity: 'legendary', bg: ['#450a0a', '#dc2626'] },
    { id: 'heart-of-gems', name: 'Heart of Gems', art: 'diamond', rarity: 'legendary', bg: ['#0f172a', '#7c3aed'] },
  ];

  const ACHIEVEMENTS = [
    { id: 'spin', name: 'First Spin', text: 'Spin the reels.' },
    { id: 'feature', name: 'Feature Presentation', text: 'Trigger any bonus feature.' },
    { id: 'fs', name: 'Orb Whisperer', text: 'Trigger Free Spins.' },
    { id: 'retrigger', name: 'Encore', text: 'Retrigger Free Spins.' },
    { id: 'pick', name: 'Treasure Hunter', text: 'Open a Treasure Pick.' },
    { id: 'wheel', name: 'Round and Round', text: 'Spin the Gem Wheel.' },
    { id: 'win10', name: 'Ten Times', text: 'Win 10× your bet at once.' },
    { id: 'big', name: 'Big Winner', text: `Land a Big Win (${BIG_WIN}× bet).` },
    { id: 'mega', name: 'Mega Moment', text: `Land a Mega Win (${MEGA_WIN}× bet).` },
    { id: 'win100', name: 'Hundredfold', text: 'Win 100× your bet at once.' },
    { id: 'jackpot', name: 'Jackpot!', text: 'Win the progressive jackpot.' },
    { id: 'daily', name: 'Daily Visitor', text: 'Claim a daily gift.' },
    { id: 'cards10', name: 'Collector', text: 'Collect 10 different gem cards.' },
    { id: 'album', name: 'Full Album', text: `Collect every gem card (bonus ${ALBUM_BONUS.toLocaleString('en-US')} gems).` },
    { id: 'max', name: 'High Roller', text: 'Spin at the top bet.' },
    { id: 'spins500', name: 'Marathon', text: 'Make 500 paid spins.' },
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const easeOutBack = (t) => {
    const c = 1.2;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const tierFor = (x) => (x >= EPIC_WIN ? 3 : x >= MEGA_WIN ? 2 : x >= BIG_WIN ? 1 : 0);

  // ---------------------------------------------------------------------------
  // Slot maths (no drawing, so it can be simulated)
  // ---------------------------------------------------------------------------

  const REEL_TOTALS = [0, 1, 2, 3, 4].map((r) => SYMBOL_IDS.reduce((s, id) => s + SYMBOLS[id].weight[r], 0));

  function randomSymbol(reel) {
    let x = Math.random() * REEL_TOTALS[reel];
    for (const id of SYMBOL_IDS) {
      x -= SYMBOLS[id].weight[reel];
      if (x < 0) return id;
    }
    return 'ruby';
  }

  function randomGrid() {
    const grid = [];
    for (let r = 0; r < REELS; r++) grid.push([0, 1, 2].map(() => randomSymbol(r)));
    return grid;
  }

  // Score a grid: line wins (left to right, wilds substitute), orbs and chests.
  // Five wilds on a line also win the progressive jackpot (paid by the caller).
  function evaluate(grid, bet) {
    const lineBet = bet / LINES;
    const lines = [];
    PAYLINES.forEach((line, li) => {
      const syms = line.map((row, reel) => grid[reel][row]);
      let best = null;
      for (const id of SYMBOL_IDS) {
        if (!SYMBOLS[id].pays.length) continue;
        let n = 0;
        while (n < REELS && (syms[n] === id || (syms[n] === 'wild' && id !== 'wild') || (id === 'wild' && syms[n] === 'wild'))) n++;
        // A run of wilds followed by something else counts for that symbol, not as wilds.
        const win = SYMBOLS[id].pays[n] * lineBet;
        if (win > 0 && (!best || win > best.win)) best = { line: li, count: n, symbol: id, win };
      }
      if (best) lines.push(best);
    });
    let orbs = 0;
    let chests = 0;
    const orbCells = [];
    const chestCells = [];
    for (let r = 0; r < REELS; r++) {
      for (let row = 0; row < ROWS; row++) {
        if (grid[r][row] === 'orb') { orbs++; orbCells.push([r, row]); }
        if (grid[r][row] === 'chest') { chests++; chestCells.push([r, row]); }
      }
    }
    const orbWin = ORB_PAY[Math.min(orbs, 5)] * bet;
    const total = lines.reduce((s, l) => s + l.win, 0) + orbWin;
    return {
      lines, orbs, chests, orbCells, chestCells, orbWin, total,
      freeSpins: ORB_SPINS[Math.min(orbs, 5)],
      pick: chests >= 3 ? Math.min(chests, 5) : 0,
      jackpot: lines.some((l) => l.symbol === 'wild' && l.count === 5),
    };
  }

  function pickBonus(picks) {
    const prizes = shuffle(CHEST_PRIZES);
    return prizes.slice(0, picks).reduce((s, v) => s + v, 0);
  }

  // Monte Carlo return-to-player, for tuning (window.__slots.simulate). The
  // jackpot pool is tracked in bets, exactly as the game does.
  function simulate(n) {
    const bet = 100;
    let paid = 0;
    let won = 0;
    let base = 0;
    let fsWon = 0;
    let pickWon = 0;
    let wheelWon = 0;
    let jpWon = 0;
    let hits = 0;
    let fsTriggers = 0;
    let picks = 0;
    let wheels = 0;
    let jackpots = 0;
    let bigWins = 0;
    let meter = 0;
    let pool = JP_SEED;
    const hitJackpot = () => {
      const v = pool * bet;
      pool = JP_SEED;
      jackpots++;
      jpWon += v;
      won += v;
    };
    const runFree = (spins) => {
      let total = 0;
      while (spins > 0) {
        spins--;
        const res = evaluate(randomGrid(), bet);
        total += res.total * FS_MULT;
        if (res.pick) total += pickBonus(res.pick) * bet;
        if (res.orbs >= 3) spins += FS_RETRIGGER;
        if (res.jackpot) hitJackpot();
      }
      return total;
    };
    for (let i = 0; i < n; i++) {
      paid += bet;
      meter++;
      pool += JP_RATE;
      const res = evaluate(randomGrid(), bet);
      if (res.total > 0 || res.pick || res.freeSpins) hits++;
      if (res.total >= BIG_WIN * bet) bigWins++;
      base += res.total;
      won += res.total;
      if (res.jackpot) hitJackpot();
      if (res.pick) {
        picks++;
        const v = pickBonus(res.pick) * bet;
        pickWon += v;
        won += v;
      }
      if (res.freeSpins) {
        fsTriggers++;
        const v = runFree(res.freeSpins);
        fsWon += v;
        won += v;
      }
      if (meter >= METER_MAX) {
        meter = 0;
        wheels++;
        const slice = WHEEL[Math.floor(Math.random() * WHEEL.length)];
        if (slice.jackpot) hitJackpot();
        else {
          const v = slice.fs ? runFree(slice.fs) : slice.mult * bet;
          wheelWon += v;
          won += v;
        }
      }
    }
    const r4 = (v) => +(v / paid).toFixed(4);
    return {
      spins: n,
      rtp: r4(won),
      base: r4(base),
      freeSpins: r4(fsWon),
      pick: r4(pickWon),
      wheel: r4(wheelWon),
      jackpot: r4(jpWon),
      hitRate: +(hits / n).toFixed(3),
      fsEvery: Math.round(n / Math.max(1, fsTriggers)),
      pickEvery: Math.round(n / Math.max(1, picks)),
      bigWinEvery: Math.round(n / Math.max(1, bigWins)),
      jackpotEvery: Math.round(n / Math.max(1, jackpots)),
      avgJackpot: jackpots ? +(jpWon / jackpots / bet).toFixed(1) : 0,
      wheels,
      jackpots,
    };
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

    // A short burst of filtered noise (thunks and whooshes).
    noise(dur, vol, freq, delay = 0) {
      const c = this.ctx;
      if (!this.noiseBuf) {
        this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime + delay;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    spin() { this.play('spin', 0.1, () => { this.tone(220, 0.25, 'triangle', 0.05, 440); this.noise(0.25, 0.04, 1800); }); },
    tick() { this.play('tick', 0.05, () => this.tone(1400, 0.02, 'square', 0.015)); },
    thunk(i) {
      this.play('thunk', 0.03, () => {
        this.tone(130 - i * 8, 0.14, 'sine', 0.2, 48);
        this.noise(0.05, 0.1, 700);
      });
    },
    tease() { this.play('tease', 0.3, () => this.tone(500, 0.5, 'triangle', 0.04, 900)); },
    heart() {
      this.play('heart', 0.4, () => {
        this.tone(72, 0.14, 'sine', 0.32, 44);
        this.tone(64, 0.14, 'sine', 0.22, 40, 0.17);
      });
    },
    land(k) { this.play('land' + k, 0.05, () => this.tone(660 * Math.pow(1.26, k), 0.18, 'triangle', 0.07)); },
    win(size) {
      this.play('win', 0.2, () => {
        const notes = size > 2 ? [523, 659, 784, 1047, 1319] : size > 1 ? [523, 659, 784, 1047] : [659, 880];
        notes.forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.07, null, i * 0.08));
      });
    },
    tierUp(k) {
      this.play('tier', 0.3, () => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f * Math.pow(1.12, k), 0.24, 'square', 0.03, null, i * 0.06));
        this.noise(0.4, 0.05, 3000);
      });
    },
    jackpot() {
      this.play('jackpot', 1, () => {
        [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.08, null, i * 0.09));
        [262, 330, 392].forEach((f) => this.tone(f, 1.4, 'sawtooth', 0.025, null, 0.65));
      });
    },
    count(p) { this.play('count', 0.06, () => this.tone(1200 + p * 1400 + Math.random() * 200, 0.03, 'sine', 0.02)); },
    coin() { this.play('coin', 0.07, () => this.tone(2400 + Math.random() * 900, 0.05, 'square', 0.01)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
    chime() { this.play('chime', 0.2, () => [1319, 1760, 2093].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.05, null, i * 0.08))); },
    reveal(v) { this.play('reveal', 0.05, () => this.tone(500 + v * 30, 0.2, 'triangle', 0.08, 1000 + v * 40)); },
    fanfare() {
      this.play('fanfare', 0.5, () => [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.08, null, i * 0.1)));
    },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
    } catch {
      return null;
    }
  }

  // The first five fields are the original format; the rest were added later
  // and are all optional, so old saves still load.
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        gems: state.gems, bet: state.betIndex, meter: state.meter, biggest: state.biggest, spins: state.spins,
        jackpot: state.jackpot, cards: state.cards, ach: state.ach, daily: state.daily, guide: state.guideDone,
        turbo: state.settings.turbo, reduced: state.settings.reduced, muted: Sound.muted,
      }));
    } catch {
      // Storage can be unavailable (private mode); progress just isn't kept.
    }
  }

  let state = null;
  const input = { mx: -1, my: -1, hold: null };

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function newState() {
    const saved = loadSave() || {};
    const has = (k) => saved[k] !== undefined && saved[k] !== null;
    Sound.muted = !!saved.muted;
    state = {
      mode: 'menu',
      phase: 'idle', // 'idle' | 'spin' | 'result'
      gems: has('gems') ? saved.gems : START_GEMS,
      betIndex: has('bet') ? clamp(saved.bet, 0, BETS.length - 1) : 1,
      meter: saved.meter && typeof saved.meter.charge === 'number' ? saved.meter : { charge: 0, betSum: 0 },
      biggest: saved.biggest || 0,
      spins: saved.spins || 0,
      jackpot: typeof saved.jackpot === 'number' ? saved.jackpot : JP_SEED, // in bets
      cards: saved.cards && typeof saved.cards === 'object' ? saved.cards : {},
      ach: saved.ach && typeof saved.ach === 'object' ? saved.ach : {},
      daily: saved.daily || '',
      guideDone: !!saved.guide,
      settings: {
        turbo: params.has('turbo') || !!saved.turbo,
        reduced: has('reduced') ? !!saved.reduced : prefersReducedMotion(),
      },
      grid: randomGrid(),
      reels: [],
      result: null,
      win: 0, // amount won on the current spin, counted up on screen
      jpWin: 0,
      shown: 0,
      resultT: 0,
      lineT: 0,
      fs: null, // { left, total, bet, win }
      queue: [],
      feature: null,
      celebrate: null,
      auto: 0,
      parts: [],
      toasts: [],
      guide: null, // step index while the first-play guide is showing
      showInfo: 0, // paytable page, 0 when closed
      cam: null,
      shake: 0,
      flash: 0,
      beat: 0,
      heartT: 0,
      jpShown: 0,
      t: 0,
    };
  }

  const bet = () => (state.fs ? state.fs.bet : BETS[state.betIndex]);
  const reduced = () => state.settings.reduced;
  const turbo = () => state.settings.turbo;
  const dailyReady = () => state.daily !== todayKey();

  function canSpin() {
    return state.mode === 'playing' && !state.feature && !state.showInfo && state.guide === null && !state.celebrate;
  }

  // Stop the spinning reels early.
  function slam() {
    for (const r of state.reels) r.dur = Math.min(r.dur, r.t + 0.12 + r.i * 0.05);
  }

  function spin() {
    if (!canSpin()) return;
    if (state.phase === 'spin') {
      slam();
      return;
    }
    if (state.phase === 'result') {
      finishResult();
      // Finishing may have opened a feature or queued the next spin itself.
      if (!canSpin() || state.pendingSpin) return;
    }
    if (state.phase !== 'idle') return;
    state.pendingSpin = null;
    if (!state.fs && state.gems < bet()) {
      // Drop to the biggest bet the balance still covers.
      let i = state.betIndex;
      while (i > 0 && BETS[i] > state.gems) i--;
      if (BETS[i] > state.gems) {
        Sound.deny();
        state.auto = 0;
        return;
      }
      state.betIndex = i;
    }
    const b = bet();
    if (!state.fs) {
      state.gems -= b;
      state.meter.charge++;
      state.meter.betSum += b;
      state.spins++;
      state.jackpot += JP_RATE;
      unlock('spin');
      if (state.betIndex === BETS.length - 1) unlock('max');
      if (state.spins >= 500) unlock('spins500');
    } else {
      state.fs.left--;
    }
    state.grid = state.forceGrid || randomGrid();
    state.forceGrid = null;
    state.result = evaluate(state.grid, b);
    state.win = 0;
    state.jpWin = 0;
    state.shown = 0;
    state.cam = null;
    startReels();
    state.phase = 'spin';
    Sound.spin();
  }

  // Build a strip per reel that ends on the result, and time the stops. When
  // two orbs or chests (or four wilds on a line) are already showing, the
  // remaining reels slow down, glow and get a heartbeat.
  function startReels() {
    const speed = turbo() ? 0.4 : 1;
    let tease = null;
    let orbs = 0;
    let chests = 0;
    const g = state.grid;
    const jackpotTease = PAYLINES.some((line) => line.slice(0, 4).every((row, r) => g[r][row] === 'wild'));
    state.reels = g.map((col, i) => {
      if (!tease) {
        if (orbs >= 2) tease = 'orb';
        else if (chests >= 2) tease = 'chest';
        else if (i === 4 && jackpotTease) tease = 'jackpot';
      }
      orbs += col.filter((s) => s === 'orb').length;
      chests += col.filter((s) => s === 'chest').length;
      const extra = 10 + i * 4 + (tease ? 16 : 0);
      const strip = [...col];
      for (let k = 0; k < extra; k++) strip.push(randomSymbol(i));
      return {
        i, strip, t: 0, done: false, tease, stopT: 9,
        dur: (0.55 + i * 0.18 + (tease ? 1.25 : 0)) * speed,
      };
    });
    state.heartT = 0;
  }

  function updateReels(dt) {
    let allDone = true;
    let teasing = false;
    state.reels.forEach((r) => {
      if (r.done) return;
      r.t += dt;
      if (r.tease && r.t < r.dur) teasing = true;
      if (r.t >= r.dur) {
        r.done = true;
        r.stopT = 0;
        Sound.thunk(r.i);
        const col = state.grid[r.i];
        if (col.includes('orb') || col.includes('chest')) Sound.land(r.i);
        if (!reduced()) state.shake = Math.max(state.shake, r.tease ? 3 : 1.2);
      } else {
        allDone = false;
        if (Math.random() < dt * 20) Sound.tick();
      }
    });
    // Anticipation heartbeat while a teased reel is still spinning.
    if (teasing) {
      state.heartT -= dt;
      if (state.heartT <= 0) {
        state.heartT = 0.78;
        state.beat = 1;
        Sound.heart();
        Sound.tease();
      }
    }
    if (allDone) onReelsStopped();
  }

  function onReelsStopped() {
    const res = state.result;
    const mult = state.fs ? FS_MULT : 1;
    const b = bet();
    state.win = res.total * mult;
    state.phase = 'result';
    state.resultT = 0;
    state.lineT = 0;
    if (res.jackpot) {
      state.jpWin = Math.round(state.jackpot * b);
      state.jackpot = JP_SEED;
      state.win += state.jpWin;
      unlock('jackpot');
      state.awardLegendary = true;
    }
    if (state.win > 0) {
      const x = state.win / b;
      const tier = res.jackpot ? 4 : tierFor(x);
      checkWin(x);
      if (tier) startCelebration(state.win, b, tier === 4, true);
      else {
        Sound.win(x >= 5 ? 2 : 1);
        state.flash = 1;
      }
      // Punch the camera in on the best line.
      if (!reduced() && res.lines.length && (x >= 3 || tier)) {
        const best = res.lines.reduce((a, l) => (l.win > a.win ? l : a));
        let sx = 0;
        let sy = 0;
        for (let r = 0; r < best.count; r++) {
          sx += REEL_X + r * CELL_W + CELL_W / 2;
          sy += REEL_Y + PAYLINES[best.line][r] * CELL_H + CELL_H / 2;
        }
        state.cam = { t: 0, x: sx / best.count, y: sy / best.count, z: tier ? 0.08 : 0.05 };
      }
    }
    if (state.fs) state.fs.win += state.win;
    if (res.pick) state.queue.push({ type: 'pick', picks: res.pick });
    if (res.freeSpins) {
      if (state.fs) {
        state.fs.left += FS_RETRIGGER;
        state.fs.total += FS_RETRIGGER;
        state.queue.push({ type: 'retrigger', spins: FS_RETRIGGER });
        unlock('retrigger');
      } else {
        state.queue.push({ type: 'fsIntro', spins: res.freeSpins });
      }
    }
    if (!state.fs && state.meter.charge >= METER_MAX) state.queue.push({ type: 'wheel' });
  }

  function credit(amount) {
    state.gems += amount;
    state.biggest = Math.max(state.biggest, amount);
    save();
  }

  // Leave the result phase: pay out and move on to features or the next spin.
  function finishResult() {
    if (state.phase !== 'result') return;
    state.celebrate = null;
    if (!state.fs) credit(state.win);
    state.shown = state.win;
    state.phase = 'idle';
    if (state.awardLegendary) {
      state.awardLegendary = false;
      awardCard('legendary');
    }
    save();
    nextStep();
  }

  function nextStep() {
    if (state.queue.length) {
      startFeature(state.queue.shift());
      return;
    }
    if (state.fs) {
      if (state.fs.left > 0) {
        state.pendingSpin = turbo() ? 0.25 : 0.5;
      } else {
        state.feature = { type: 'fsSummary', win: state.fs.win, t: 0 };
        Sound.fanfare();
      }
      return;
    }
    if (state.auto > 0) {
      state.auto--;
      state.pendingSpin = turbo() ? 0.15 : 0.35;
    }
  }

  function checkWin(x) {
    if (x >= 10) unlock('win10');
    if (x >= 100) unlock('win100');
    if (x >= BIG_WIN) unlock('big');
    if (x >= MEGA_WIN) unlock('mega');
  }

  // ---------------------------------------------------------------------------
  // Celebrations: a counting win meter that climbs through the tiers
  // ---------------------------------------------------------------------------

  // keys are the multiples of the bet the meter pauses on (each tier, then
  // the final amount); every segment takes the same time so each tier lands.
  function startCelebration(amount, b, jackpot, fromSpin) {
    const x = amount / b;
    const keys = jackpot ? [x] : [BIG_WIN, MEGA_WIN, EPIC_WIN].filter((k) => k < x).concat([x]);
    state.celebrate = {
      amount, bet: b, keys, fromSpin, jackpot,
      seg: (turbo() ? 1.0 : 1.6) * (jackpot ? 2.4 : 1),
      level: jackpot ? 4 : 1,
      final: jackpot ? 4 : tierFor(x),
      shown: 0, t: 0, done: false, doneT: 0, punch: 1, emit: 0,
    };
    if (jackpot) Sound.jackpot();
    else Sound.tierUp(1);
    burst(jackpot ? 4 : 1);
  }

  // Confetti, sparks and a jolt for each new tier.
  function burst(level) {
    if (reduced()) return;
    confetti(30 + level * 25);
    sparks(W / 2, 250, 30 + level * 10, TIERS[level].color);
    state.shake = Math.max(state.shake, 3 + level * 1.5);
  }

  function updateCelebrate(dt) {
    const c = state.celebrate;
    if (!c) return;
    c.t += dt;
    c.punch = Math.max(0, c.punch - dt * 2.5);
    if (!c.done) {
      const i = Math.floor(c.t / c.seg);
      if (i >= c.keys.length) {
        endCount(c);
      } else {
        const from = i ? c.keys[i - 1] : 0;
        let u = (c.t - i * c.seg) / c.seg;
        if (i === c.keys.length - 1) u = 1 - Math.pow(1 - u, 2);
        c.shown = Math.min(c.amount, (from + (c.keys[i] - from) * u) * c.bet);
        const level = c.jackpot ? 4 : Math.max(1, tierFor(c.shown / c.bet + 1e-9));
        if (level > c.level) {
          c.level = level;
          c.punch = 1;
          Sound.tierUp(level);
          burst(level);
        }
        Sound.count(c.t / (c.seg * c.keys.length));
      }
      // The coin fountain.
      if (!reduced()) {
        c.emit += dt * TIERS[c.level].rate;
        while (c.emit >= 1) {
          c.emit--;
          fountainPiece();
        }
        if (Math.random() < dt * 10) Sound.coin();
      }
    } else {
      c.doneT += dt;
    }
    if (c.fromSpin) state.shown = c.shown;
  }

  function endCount(c) {
    c.done = true;
    c.doneT = 0;
    c.shown = c.amount;
    if (c.final > c.level) c.level = c.final;
    c.punch = 1;
    Sound.win(3);
    if (!reduced()) {
      confetti(60);
      for (let k = 0; k < 40; k++) fountainPiece();
    }
  }

  // Space or a click: skip the count, then close.
  function skipCelebrate() {
    const c = state.celebrate;
    if (!c) return;
    if (!c.done) {
      if (c.t < 0.25) return; // ignore the click that caused it
      endCount(c);
    } else closeCelebrate();
  }

  function closeCelebrate() {
    const c = state.celebrate;
    state.celebrate = null;
    if (c && c.fromSpin && state.phase === 'result') finishResult();
  }

  // ---------------------------------------------------------------------------
  // Features
  // ---------------------------------------------------------------------------

  function startFeature(f) {
    state.auto = 0;
    if (f.type === 'pick') {
      state.feature = { type: 'pick', picks: f.picks, left: f.picks, prizes: shuffle(CHEST_PRIZES), open: [], total: 0, bet: bet(), t: 0 };
      unlock('feature');
      unlock('pick');
      Sound.fanfare();
      if (!reduced()) confetti(40);
    } else if (f.type === 'fsIntro') {
      state.feature = { type: 'fsIntro', spins: f.spins, bet: state.wheelFsBet || bet(), t: 0 };
      state.wheelFsBet = null;
      unlock('feature');
      unlock('fs');
      Sound.fanfare();
      if (!reduced()) confetti(50);
    } else if (f.type === 'retrigger') {
      state.feature = { type: 'retrigger', spins: f.spins, t: 0 };
      Sound.fanfare();
    } else if (f.type === 'wheel') {
      const avg = Math.max(BETS[0], Math.round(state.meter.betSum / Math.max(1, state.meter.charge)));
      state.meter = { charge: 0, betSum: 0 };
      save();
      state.feature = { type: 'wheel', slices: WHEEL, bet: avg, angle: 0, spinning: false, done: false, t: 0, tick: 0 };
      unlock('feature');
      unlock('wheel');
      Sound.fanfare();
    } else if (f.type === 'daily') {
      state.feature = { type: 'daily', slices: DAILY, angle: 0, spinning: false, done: false, t: 0, tick: 0 };
      Sound.fanfare();
    }
  }

  function spinWheel(f) {
    const slot = Math.floor(Math.random() * f.slices.length);
    f.slot = slot;
    const seg = (Math.PI * 2) / f.slices.length;
    // The pointer is at the top; land the chosen slice's centre under it.
    const target = -Math.PI / 2 - (slot + 0.5) * seg;
    f.from = f.angle;
    f.to = target - Math.PI * 2 * 6 + rand(-0.3, 0.3) * seg;
    while (f.to > f.from - Math.PI * 8) f.to -= Math.PI * 2;
    f.spinT = 0;
    f.spinning = true;
    Sound.spin();
  }

  // The wheel pays the moment it stops, so a reload can't lose the prize.
  function wheelStopped(f) {
    const s = f.slices[f.slot];
    f.spinning = false;
    f.done = true;
    f.doneAt = state.t;
    if (f.type === 'daily') {
      f.prize = s.gems;
      credit(s.gems);
      Sound.win(2);
      gemShower(30);
      return;
    }
    if (s.jackpot) {
      f.prize = Math.round(state.jackpot * f.bet);
      state.jackpot = JP_SEED;
      credit(f.prize);
      unlock('jackpot');
      Sound.jackpot();
      gemShower(120);
    } else if (s.mult) {
      f.prize = s.mult * f.bet;
      credit(f.prize);
      checkWin(s.mult);
      Sound.win(2);
      gemShower(30);
    } else {
      Sound.win(2);
      gemShower(30);
    }
  }

  function featureClick(id) {
    const f = state.feature;
    if (!f) return;
    if (f.type === 'fsIntro' && id === 'fs-start') {
      state.fs = { left: f.spins, total: f.spins, bet: f.bet, win: 0 };
      state.feature = null;
      state.result = null;
      Sound.click();
      nextStep();
    } else if (f.type === 'retrigger' && id === 'ok') {
      state.feature = null;
      nextStep();
    } else if (f.type === 'fsSummary' && id === 'ok') {
      const b = state.fs.bet;
      credit(f.win);
      state.shown = f.win;
      state.fs = null;
      state.feature = null;
      checkWin(f.win / b);
      awardCard();
      if (f.win / b >= BIG_WIN) startCelebration(f.win, b, false, false);
      nextStep();
    } else if (f.type === 'pick') {
      if (id.startsWith('chest:') && f.left > 0) {
        const k = Number(id.slice(6));
        if (f.open.includes(k)) return;
        f.open.push(k);
        f.left--;
        f.total += f.prizes[k];
        f.openT = f.openT || {};
        f.openT[k] = state.t;
        Sound.reveal(f.prizes[k]);
        const b = featureButtons()[k];
        if (!reduced()) sparks(b.x + b.w / 2, b.y + b.h / 2, 18 + f.prizes[k] * 2, '#fde047');
        if (f.left === 0) f.doneT = 0;
      } else if (id === 'collect' && f.left === 0) {
        const amount = f.total * f.bet;
        if (state.fs) state.fs.win += amount;
        else credit(amount);
        state.shown = amount;
        state.feature = null;
        checkWin(f.total);
        awardCard();
        if (f.total >= BIG_WIN && !state.fs) startCelebration(amount, f.bet, false, false);
        else Sound.win(f.total >= 8 ? 2 : 1);
        nextStep();
      }
    } else if (f.type === 'wheel' || f.type === 'daily') {
      if (id === 'wheel-spin' && !f.spinning && !f.done) {
        if (f.type === 'daily') {
          // Claim the day as the wheel starts, so it really is once a day.
          state.daily = todayKey();
          unlock('daily');
          save();
        }
        spinWheel(f);
      } else if (id === 'collect' && f.done) {
        const s = f.slices[f.slot];
        state.feature = null;
        awardCard(s.jackpot ? 'legendary' : null);
        if (s.fs) {
          state.queue.unshift({ type: 'fsIntro', spins: s.fs });
          // Free spins from the wheel play at the wheel's bet.
          state.wheelFsBet = f.bet;
        } else {
          state.shown = f.prize;
          if (s.jackpot) startCelebration(f.prize, f.bet, true, false);
          else if (s.mult >= BIG_WIN) startCelebration(f.prize, f.bet, false, false);
        }
        nextStep();
      }
    }
  }

  function updateFeature(dt) {
    const f = state.feature;
    if (!f) return;
    f.t += dt;
    f.tick = Math.max(0, (f.tick || 0) - dt * 6);
    if ((f.type === 'wheel' || f.type === 'daily') && f.spinning) {
      f.spinT += dt;
      const dur = turbo() ? 2.6 : 4.2;
      const p = Math.min(1, f.spinT / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const prev = f.angle;
      f.angle = f.from + (f.to - f.from) * eased;
      const seg = (Math.PI * 2) / f.slices.length;
      if (Math.floor(prev / seg) !== Math.floor(f.angle / seg)) {
        Sound.tick();
        f.tick = 1;
      }
      if (p >= 1) wheelStopped(f);
    }
  }

  // ---------------------------------------------------------------------------
  // Collection, achievements and toasts
  // ---------------------------------------------------------------------------

  // Award a gem card (rarer ones less often). A jackpot gives a legendary,
  // preferring one you don't have yet.
  function awardCard(minRarity) {
    let pool = CARDS;
    if (minRarity === 'legendary') {
      const legends = CARDS.filter((c) => c.rarity === 'legendary');
      const missing = legends.filter((c) => !state.cards[c.id]);
      pool = missing.length ? missing : legends;
    }
    const total = pool.reduce((s, c) => s + RARITY[c.rarity].weight, 0);
    let x = Math.random() * total;
    let card = pool[pool.length - 1];
    for (const c of pool) {
      x -= RARITY[c.rarity].weight;
      if (x < 0) { card = c; break; }
    }
    const isNew = !state.cards[card.id];
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    toast(isNew ? 'New gem card!' : 'Gem card', isNew ? card.name : `${card.name} ×${state.cards[card.id]}`, card);
    const owned = Object.keys(state.cards).filter((id) => CARDS.some((c) => c.id === id)).length;
    if (owned >= 10) unlock('cards10');
    if (owned >= CARDS.length) unlock('album');
    save();
    return card;
  }

  function unlock(id) {
    if (!state || state.ach[id]) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    state.ach[id] = 1;
    if (id === 'album') {
      state.gems += ALBUM_BONUS;
      toast('Album complete!', `+${fmt(ALBUM_BONUS)} gems`, null, 'star');
    } else {
      toast('Achievement unlocked', a.name, null, 'star');
    }
    save();
  }

  function toast(title, text, card, icon) {
    state.toasts.push({ title, text, card, icon, t: 0 });
    if (state.toasts.length === 1) Sound.chime();
  }

  function updateToasts(dt) {
    const t = state.toasts[0];
    if (!t) return;
    t.t += dt;
    if (t.t > 2.8) {
      state.toasts.shift();
      if (state.toasts.length) Sound.chime();
    }
  }

  // ---------------------------------------------------------------------------
  // Particles: coins and gems with gravity and bounces, confetti and sparks
  // ---------------------------------------------------------------------------

  const FLOOR = H - 8;
  const MAX_PARTS = 900;
  const GEM_COLORS = ['#f43f5e', '#38bdf8', '#34d399', '#c084fc', '#fde047'];
  const CONFETTI = ['#fde047', '#f472b6', '#67e8f9', '#86efac', '#c4b5fd', '#fb923c', '#ffffff'];

  function addPart(p) {
    if (state.parts.length >= MAX_PARTS) state.parts.shift();
    state.parts.push(p);
  }

  // One piece of the fountain: shot up from below the reels.
  function fountainPiece() {
    const coin = Math.random() < 0.7;
    addPart({
      kind: coin ? 'coin' : 'gem', x: W / 2 + rand(-50, 50), y: H + 10,
      vx: rand(-340, 340), vy: rand(-1050, -700), rot: rand(0, 6), vr: rand(-9, 9),
      life: rand(2.6, 3.6), size: coin ? rand(9, 13) : rand(7, 11), bounces: 0,
      color: GEM_COLORS[Math.floor(Math.random() * GEM_COLORS.length)],
    });
  }

  function gemShower(n) {
    if (reduced()) n = Math.round(n / 5);
    for (let k = 0; k < n; k++) {
      addPart({
        kind: k % 3 ? 'gem' : 'coin', x: rand(100, W - 100), y: rand(-200, -10), vx: rand(-60, 60), vy: rand(60, 260),
        rot: rand(0, 6), vr: rand(-6, 6), life: rand(2.5, 3.5), bounces: 0,
        color: GEM_COLORS[k % 5], size: rand(7, 12),
      });
    }
  }

  function confetti(n) {
    if (reduced()) return;
    for (let k = 0; k < n; k++) {
      addPart({
        kind: 'confetti', x: rand(0, W), y: rand(-120, -10), vx: rand(-40, 40), vy: rand(30, 140),
        rot: rand(0, 6), vr: rand(-8, 8), life: rand(3, 5), size: rand(5, 9), wob: rand(2, 5), seed: rand(0, 6),
        color: CONFETTI[k % CONFETTI.length],
      });
    }
  }

  function sparks(x, y, n, color) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(120, 520);
      addPart({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), size: rand(2, 4), color, rot: 0, vr: 0 });
    }
  }

  function updateParts(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      if (p.kind === 'confetti') {
        p.vy = Math.min(p.vy + 160 * dt, 150);
        p.x += (p.vx + Math.sin(state.t * p.wob + p.seed) * 50) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      } else if (p.kind === 'spark') {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else {
        p.vy += 1400 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        // Bounce off the floor and the sides, losing energy each time.
        if (p.y > FLOOR && p.vy > 0) {
          p.y = FLOOR;
          p.vy *= -0.45;
          p.vx *= 0.7;
          p.vr *= 0.6;
          p.bounces++;
          if (p.bounces > 3) p.life = Math.min(p.life, 0.4);
        }
        if ((p.x < 6 && p.vx < 0) || (p.x > W - 6 && p.vx > 0)) p.vx *= -0.7;
      }
    }
    state.parts = state.parts.filter((p) => p.life > 0 && p.y < H + 80);
  }

  // ---------------------------------------------------------------------------
  // Step
  // ---------------------------------------------------------------------------

  function step(dt) {
    state.t += dt;
    state.shake = Math.max(0, state.shake - dt * 18);
    state.flash = Math.max(0, state.flash - dt * 1.5);
    state.beat = Math.max(0, state.beat - dt * 2.5);
    updateToasts(dt);
    // The jackpot display glides to its new value.
    const jp = state.jackpot * bet();
    state.jpShown += (jp - state.jpShown) * Math.min(1, dt * 6);
    if (Math.abs(jp - state.jpShown) < 0.5) state.jpShown = jp;
    if (state.mode !== 'playing' || state.showInfo || state.guide !== null) return;
    // Holding Spin (or Space) for a moment starts auto spin.
    const h = input.hold;
    if (h && !h.fired) {
      h.t += dt;
      if (h.t >= HOLD_AUTO) {
        h.fired = true;
        if (!state.fs && !state.feature && !state.celebrate) {
          state.auto = HOLD_SPINS;
          Sound.chime();
          if (state.phase === 'idle' && !state.pendingSpin) nextStep();
        }
      }
    }
    for (const r of state.reels) if (r.done) r.stopT += dt;
    if (state.cam) {
      state.cam.t += dt;
      if (state.cam.t > 1.6) state.cam = null;
    }
    if (state.phase === 'spin') updateReels(dt);
    else if (state.phase === 'result') {
      state.resultT += dt;
      state.lineT += dt;
      const auto = state.auto > 0 || state.fs;
      const c = state.celebrate;
      if (c) {
        if (c.fromSpin && c.done && c.doneT > (auto ? 1.8 : 4)) finishResult();
      } else {
        // Count the win up.
        if (state.shown < state.win) {
          state.shown = Math.min(state.win, state.shown + Math.max(1, state.win * dt * (turbo() ? 4 : 2)));
          Sound.count(state.shown / state.win);
        }
        const hold = state.win > 0 ? (turbo() ? 0.6 : 1.1) : turbo() ? 0.1 : 0.25;
        if (state.resultT > hold && (auto || state.queue.length || state.win === 0)) finishResult();
        else if (state.resultT > hold + 1.5) finishResult();
      }
    }
    const c = state.celebrate;
    updateCelebrate(dt);
    if (c && !c.fromSpin && c.done && c.doneT > 4) closeCelebrate();
    if (state.pendingSpin !== undefined && state.pendingSpin !== null && !state.celebrate && !state.feature) {
      state.pendingSpin -= dt;
      if (state.pendingSpin <= 0) {
        state.pendingSpin = null;
        spin();
      }
    }
    updateFeature(dt);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const sprites = new Map();

  // The backing store follows the displayed size and the pixel ratio (up to
  // 3×), so the canvas stays sharp however big the stage grows.
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth || W;
    const px = Math.min(4096, Math.round(w * dpr));
    if (canvas.width === px) return;
    canvas.width = px;
    canvas.height = Math.round(px * (H / W));
    sprites.clear();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();

  // Symbols are drawn once per size into offscreen canvases, a little larger
  // than they appear so pulses and camera zooms stay crisp.
  function sprite(id) {
    if (!sprites.has(id)) {
      const s = (canvas.width / W) * SPRITE_SCALE;
      const c = document.createElement('canvas');
      c.width = Math.ceil(CELL_W * s);
      c.height = Math.ceil(CELL_H * s);
      const g = c.getContext('2d');
      g.scale(s, s);
      drawSymbol(g, id, CELL_W / 2, CELL_H / 2, 40);
      sprites.set(id, c);
    }
    return sprites.get(id);
  }

  function gemPath(g, cx, cy, r, sides, rot) {
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  }

  function facetGem(g, cx, cy, r, sides, rot, light, mid, dark) {
    const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, light);
    grad.addColorStop(0.5, mid);
    grad.addColorStop(1, dark);
    gemPath(g, cx, cy, r, sides, rot);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.stroke();
    // Table and facets.
    gemPath(g, cx, cy, r * 0.5, sides, rot);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.stroke();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.stroke();
    }
    // Sparkle.
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.14, r * 0.07, -0.6, 0, Math.PI * 2);
    g.fill();
  }

  function drawSymbol(g, id, cx, cy, r) {
    g.save();
    g.lineJoin = 'round';
    if (id === 'ruby') facetGem(g, cx, cy, r * 0.85, 6, Math.PI / 6, '#fecdd3', '#e11d48', '#881337');
    else if (id === 'sapphire') facetGem(g, cx, cy, r * 0.85, 10, 0, '#bfdbfe', '#2563eb', '#1e3a8a');
    else if (id === 'emerald') {
      facetGem(g, cx, cy, r * 0.9, 8, Math.PI / 8, '#bbf7d0', '#16a34a', '#14532d');
    } else if (id === 'amethyst') facetGem(g, cx, cy, r * 0.95, 3, -Math.PI / 2, '#f5d0fe', '#a855f7', '#581c87');
    else if (id === 'crown') {
      const grad = g.createLinearGradient(cx, cy - r, cx, cy + r);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(1, '#ca8a04');
      g.beginPath();
      g.moveTo(cx - r * 0.9, cy + r * 0.55);
      g.lineTo(cx - r * 0.95, cy - r * 0.45);
      g.lineTo(cx - r * 0.45, cy);
      g.lineTo(cx, cy - r * 0.75);
      g.lineTo(cx + r * 0.45, cy);
      g.lineTo(cx + r * 0.95, cy - r * 0.45);
      g.lineTo(cx + r * 0.9, cy + r * 0.55);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = '#713f12';
      g.lineWidth = 2.5;
      g.stroke();
      g.fillStyle = '#ca8a04';
      g.fillRect(cx - r * 0.9, cy + r * 0.45, r * 1.8, r * 0.25);
      g.strokeRect(cx - r * 0.9, cy + r * 0.45, r * 1.8, r * 0.25);
      for (const [dx, col] of [[-0.5, '#e11d48'], [0, '#2563eb'], [0.5, '#16a34a']]) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(cx + dx * r, cy + r * 0.25, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      for (const dx of [-0.95, 0, 0.95]) {
        g.fillStyle = '#fef9c3';
        g.beginPath();
        g.arc(cx + dx * r, cy + (dx ? -0.5 : -0.8) * r, r * 0.1, 0, Math.PI * 2);
        g.fill();
      }
    } else if (id === 'seven') {
      g.font = `900 ${r * 2.2}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const grad = g.createLinearGradient(cx, cy - r, cx, cy + r);
      grad.addColorStop(0, '#fde047');
      grad.addColorStop(0.5, '#f97316');
      grad.addColorStop(1, '#dc2626');
      g.lineWidth = r * 0.18;
      g.strokeStyle = '#450a0a';
      g.strokeText('7', cx, cy + r * 0.08);
      g.fillStyle = grad;
      g.fillText('7', cx, cy + r * 0.08);
      g.lineWidth = r * 0.05;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.strokeText('7', cx, cy + r * 0.08);
    } else if (id === 'diamond') {
      // A brilliant-cut diamond seen from the side.
      const top = cy - r * 0.55;
      const girdle = cy - r * 0.15;
      const bottom = cy + r * 0.9;
      const grad = g.createLinearGradient(cx - r, top, cx + r, bottom);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#a5f3fc');
      grad.addColorStop(1, '#0891b2');
      g.beginPath();
      g.moveTo(cx - r * 0.55, top);
      g.lineTo(cx + r * 0.55, top);
      g.lineTo(cx + r, girdle);
      g.lineTo(cx, bottom);
      g.lineTo(cx - r, girdle);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = '#ecfeff';
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = 'rgba(8, 51, 68, 0.45)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - r, girdle);
      g.lineTo(cx + r, girdle);
      for (const k of [-0.55, -0.18, 0.18, 0.55]) {
        g.moveTo(cx + k * r, top);
        g.lineTo(cx + k * r * 1.4, girdle);
        g.lineTo(cx, bottom);
      }
      g.stroke();
      g.fillStyle = '#fff';
      for (const [dx, dy, s] of [[-0.75, -0.7, 0.16], [0.8, 0.3, 0.1]]) {
        g.beginPath();
        g.moveTo(cx + dx * r, cy + dy * r - s * r);
        g.lineTo(cx + dx * r + s * r * 0.3, cy + dy * r);
        g.lineTo(cx + dx * r, cy + dy * r + s * r);
        g.lineTo(cx + dx * r - s * r * 0.3, cy + dy * r);
        g.fill();
      }
    } else if (id === 'wild') {
      const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grad.addColorStop(0, '#f0abfc');
      grad.addColorStop(0.5, '#c026d3');
      grad.addColorStop(1, '#6b21a8');
      gemPath(g, cx, cy, r, 4, 0);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = '#fdf4ff';
      g.lineWidth = 2.5;
      g.stroke();
      g.font = `900 ${r * 0.62}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = r * 0.1;
      g.strokeStyle = '#3b0764';
      g.strokeText('WILD', cx, cy + 1);
      g.fillStyle = '#fff';
      g.fillText('WILD', cx, cy + 1);
    } else if (id === 'orb') {
      const glowG = g.createRadialGradient(cx, cy, 2, cx, cy, r * 1.1);
      glowG.addColorStop(0, '#ecfeff');
      glowG.addColorStop(0.45, '#22d3ee');
      glowG.addColorStop(0.8, '#0e7490');
      glowG.addColorStop(1, 'rgba(14,116,144,0)');
      g.fillStyle = glowG;
      g.beginPath();
      g.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(236,254,255,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(cx, cy, r * 0.95, r * 0.35, -0.4, 0, Math.PI * 2);
      g.stroke();
      // Star.
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.18 : r * 0.42;
        g.lineTo(cx + Math.cos(a) * rr, cy - r * 0.1 + Math.sin(a) * rr);
      }
      g.fill();
      g.font = `900 ${r * 0.36}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.lineWidth = r * 0.075;
      g.strokeStyle = '#083344';
      g.strokeText('FREE', cx, cy + r * 0.72);
      g.fillStyle = '#ecfeff';
      g.fillText('FREE', cx, cy + r * 0.72);
    } else if (id === 'chest') {
      // Body.
      g.fillStyle = '#92400e';
      g.strokeStyle = '#451a03';
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(cx - r * 0.95, cy - r * 0.1, r * 1.9, r * 0.95, r * 0.12);
      g.fill();
      g.stroke();
      // Open lid.
      g.fillStyle = '#b45309';
      g.beginPath();
      g.moveTo(cx - r * 0.95, cy - r * 0.1);
      g.lineTo(cx - r * 0.8, cy - r * 0.75);
      g.lineTo(cx + r * 0.8, cy - r * 0.75);
      g.lineTo(cx + r * 0.95, cy - r * 0.1);
      g.closePath();
      g.fill();
      g.stroke();
      // Treasure glinting inside.
      for (const [dx, col] of [[-0.45, '#f43f5e'], [0, '#fde047'], [0.45, '#38bdf8']]) {
        g.fillStyle = col;
        gemPath(g, cx + dx * r, cy - r * 0.1, r * 0.2, 6, 0);
        g.fill();
      }
      g.fillStyle = '#fbbf24';
      g.fillRect(cx - r * 0.95, cy + r * 0.2, r * 1.9, r * 0.14);
      g.fillRect(cx - r * 0.12, cy + r * 0.1, r * 0.24, r * 0.35);
    } else if (id === 'wheel') {
      drawWheelDisc(g, cx, cy, r, 0.3, WHEEL);
    }
    g.restore();
  }

  // A small static wheel (meter, card art).
  function drawWheelDisc(g, cx, cy, r, rot, slices) {
    const seg = (Math.PI * 2) / slices.length;
    slices.forEach((s, i) => {
      g.fillStyle = s.color;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, rot + i * seg, rot + (i + 1) * seg);
      g.fill();
    });
    g.strokeStyle = '#fde68a';
    g.lineWidth = Math.max(2, r * 0.1);
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    g.fill();
  }

  // A gem card for the album and toasts, drawn at w × h.
  function drawCard(g, card, x, y, w, h, owned) {
    const rar = RARITY[card.rarity];
    const k = w / 120;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.roundRect(0, 0, w, h, 10 * k);
    g.fillStyle = rar.color;
    g.fill();
    g.beginPath();
    g.roundRect(3 * k, 3 * k, w - 6 * k, h - 6 * k, 8 * k);
    if (owned) {
      const bg = g.createLinearGradient(0, 0, w * 0.4, h);
      bg.addColorStop(0, card.bg[0]);
      bg.addColorStop(1, card.bg[1]);
      g.fillStyle = bg;
    } else g.fillStyle = '#1c1426';
    g.fill();
    g.clip();
    g.textAlign = 'center';
    if (owned) {
      // Shine rays behind the art.
      g.save();
      g.translate(w / 2, h * 0.42);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(w, -w * 0.12);
        g.lineTo(w, w * 0.12);
        g.fill();
      }
      g.restore();
      drawSymbol(g, card.art, w / 2, h * 0.42, w * 0.32);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, h * 0.76, w, h * 0.24);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(12 * k)}px system-ui, sans-serif`;
      g.fillText(card.name, w / 2, h * 0.86);
      g.fillStyle = rar.color;
      g.font = `600 ${Math.round(9 * k)}px system-ui, sans-serif`;
      g.fillText(rar.name.toUpperCase(), w / 2, h * 0.95);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.font = `900 ${Math.round(56 * k)}px system-ui, sans-serif`;
      g.fillText('?', w / 2, h * 0.55);
      g.fillStyle = rar.color;
      g.font = `600 ${Math.round(9 * k)}px system-ui, sans-serif`;
      g.fillText(rar.name.toUpperCase(), w / 2, h * 0.92);
    }
    g.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function wrapText(text, maxW) {
    const lines = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const t = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(t).width > maxW) {
        lines.push(cur);
        cur = word;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Cabinet geometry: a gold frame with a ring of chaser bulbs.
  const FRAME = { x: REEL_X - 22, y: REEL_Y - 22, w: CELL_W * REELS + 44, h: CELL_H * ROWS + 44 };
  const BULBS = (() => {
    const pts = [];
    const x0 = FRAME.x + 7.5;
    const y0 = FRAME.y + 7.5;
    const x1 = FRAME.x + FRAME.w - 7.5;
    const y1 = FRAME.y + FRAME.h - 7.5;
    const per = 2 * (x1 - x0 + y1 - y0);
    const n = Math.round(per / 22);
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per;
      if (d < x1 - x0) pts.push([x0 + d, y0]);
      else if ((d -= x1 - x0) < y1 - y0) pts.push([x1, y0 + d]);
      else if ((d -= y1 - y0) < x1 - x0) pts.push([x1 - d, y1]);
      else pts.push([x0, y1 - (d - (x1 - x0))]);
    }
    return pts;
  })();
  // Payline number tabs on both sides, spread out where lines share a row.
  const TABS = (() => {
    const tabs = [];
    for (const side of [0, 1]) {
      for (let row = 0; row < ROWS; row++) {
        const ids = PAYLINES.map((l, i) => i).filter((i) => PAYLINES[i][side ? 4 : 0] === row);
        ids.forEach((line, k) => tabs.push({
          line,
          x: side ? FRAME.x + FRAME.w + 10 : FRAME.x - 10,
          y: REEL_Y + row * CELL_H + CELL_H / 2 + (k - (ids.length - 1) / 2) * 23,
        }));
      }
    }
    return tabs;
  })();
  const tabAt = (x, y) => TABS.find((t) => Math.hypot(x - t.x, y - t.y) < 10);

  function render() {
    const s = canvas.width / W;
    let sx = 0;
    let sy = 0;
    if (state && state.shake > 0) {
      sx = rand(-1, 1) * state.shake;
      sy = rand(-1, 1) * state.shake;
    }
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
    ctx.drawImage(background(!!(state && state.fs)), -20, -20, W + 40, H + 40);
    if (!state) return;
    hoverHit = hitTest(input.mx, input.my);
    drawBackdrop();
    drawTopBar();
    ctx.save();
    applyCamera();
    drawMachine();
    drawWinLines();
    ctx.restore();
    drawJackpotCrest();
    drawMeter();
    drawSidePanel();
    drawBottomBar();
    if (state.feature) drawFeature();
    if (state.celebrate) drawCelebrateBack();
    drawParts();
    if (state.celebrate) drawCelebrate();
    if (state.showInfo) drawInfo();
    if (state.toasts.length) drawToast(state.toasts[0]);
    if (state.guide !== null) drawGuide();
    const hover = hoverHit;
    canvas.style.cursor = hover && !hover.disabled ? 'pointer' : 'default';
  }

  // A short zoom toward the winning line.
  function applyCamera() {
    const c = state.cam;
    if (!c) return;
    const t = c.t;
    const env = t < 0.18 ? 1 - Math.pow(1 - t / 0.18, 3) : t < 1 ? 1 : Math.max(0, 1 - (t - 1) / 0.6);
    const z = 1 + c.z * env;
    // Zoom around a point between the line and the reel centre, so the
    // reels never slide far off.
    const px = W / 2 + (c.x - W / 2) * 0.6;
    const py = REEL_Y + (CELL_H * ROWS) / 2 + (c.y - REEL_Y - (CELL_H * ROWS) / 2) * 0.6;
    ctx.translate(px, py);
    ctx.scale(z, z);
    ctx.translate(-px, -py);
  }

  // The backdrop gradient and the glow behind the cabinet never change, so
  // they're painted once per size (and per mode) into an offscreen canvas.
  let hoverHit = null;
  const backgrounds = new Map();
  function background(fs) {
    const key = `${canvas.width}:${fs}`;
    if (!backgrounds.has(key)) {
      backgrounds.clear();
      const c = document.createElement('canvas');
      const s = canvas.width / W;
      c.width = Math.ceil((W + 40) * s);
      c.height = Math.ceil((H + 40) * s);
      const g = c.getContext('2d');
      g.scale(s, s);
      g.translate(20, 20);
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, fs ? '#0c2a3a' : '#1e0b36');
      bg.addColorStop(1, fs ? '#041018' : '#0a0418');
      g.fillStyle = bg;
      g.fillRect(-20, -20, W + 40, H + 40);
      const glow = g.createRadialGradient(W / 2, 250, 40, W / 2, 250, 520);
      const col = fs ? '34, 211, 238' : '168, 85, 247';
      glow.addColorStop(0, `rgba(${col}, 0.22)`);
      glow.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = glow;
      g.fillRect(-20, -20, W + 40, H + 40);
      backgrounds.set(key, c);
    }
    return backgrounds.get(key);
  }

  function drawBackdrop() {
    // A flash of extra glow on wins.
    if (state.flash > 0.01) {
      const glow = ctx.createRadialGradient(W / 2, 250, 40, W / 2, 250, 520);
      const col = state.fs ? '34, 211, 238' : '168, 85, 247';
      glow.addColorStop(0, `rgba(${col}, ${state.flash * 0.3})`);
      glow.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }
    // Soft floating sparkles.
    for (let k = 0; k < 40; k++) {
      const x = (k * 97.3 + (reduced() ? 0 : state.t * (5 + (k % 7)))) % W;
      const y = (k * 53.1 + Math.sin(state.t * 0.5 + k) * 10) % H;
      ctx.fillStyle = `rgba(250, 232, 255, ${0.08 + (k % 5) * 0.04})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function gemIcon(x, y, r) {
    ctx.fillStyle = '#38bdf8';
    gemPath(ctx, x, y, r, 6, Math.PI / 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    gemPath(ctx, x - r * 0.2, y - r * 0.2, r * 0.4, 6, Math.PI / 6);
    ctx.fill();
  }

  function drawTopBar() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, 54);
    ctx.textAlign = 'left';
    const title = ctx.createLinearGradient(0, 10, 0, 40);
    title.addColorStop(0, '#fde68a');
    title.addColorStop(1, '#f59e0b');
    ctx.fillStyle = title;
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.fillText('NAMELESS SLOTS', 20, 35);
    // Balance.
    roundRect(W / 2 - 110, 7, 220, 34, 17);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    gemIcon(W / 2 - 85, 24, 10);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmt(state.gems), W / 2 + 8, 31);
    for (const b of topButtons()) drawButton(b, b.label, 'dark');
  }

  // The progressive jackpot nameplate on top of the cabinet.
  function drawJackpotCrest() {
    const w = 270;
    const x = W / 2 - w / 2;
    const y = 46;
    const h = 38;
    const pulse = reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(state.t * 3);
    ctx.save();
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10 + pulse * 10;
    roundRect(x, y, w, h, 12);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#7f1d1d');
    g.addColorStop(1, '#3b0764');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2.5;
    roundRect(x, y, w, h, 12);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 9px system-ui, sans-serif';
    ctx.fillText('P R O G R E S S I V E   J A C K P O T', W / 2, y + 13);
    const gold = ctx.createLinearGradient(0, y + 14, 0, y + 34);
    gold.addColorStop(0, '#fef9c3');
    gold.addColorStop(1, '#f59e0b');
    ctx.fillStyle = gold;
    ctx.font = '900 19px system-ui, sans-serif';
    ctx.fillText(fmt(state.jpShown), W / 2 + 8, y + 33);
    const tw = ctx.measureText(fmt(state.jpShown)).width;
    gemIcon(W / 2 + 8 - tw / 2 - 13, y + 26, 7);
  }

  // Bulb colours and which are lit, by what the machine is doing.
  function lightMode() {
    if (state.celebrate) return 'party';
    if (state.phase === 'spin' && state.reels.some((r) => r.tease && !r.done)) return 'tease';
    if (state.phase === 'spin') return 'spin';
    if (state.phase === 'result' && state.win > 0) return 'win';
    if (state.feature) return 'party';
    return 'idle';
  }

  function drawLights() {
    const mode = lightMode();
    const t = state.t;
    const n = BULBS.length;
    const still = reduced();
    const tease = state.reels.find((r) => r.tease && !r.done);
    const teaseCol = tease ? (tease.tease === 'orb' ? '#67e8f9' : tease.tease === 'chest' ? '#fbbf24' : '#f0abfc') : '';
    const winLine = state.result && state.result.lines.length ? state.result.lines[Math.floor(state.lineT / 0.9) % state.result.lines.length].line : 0;
    BULBS.forEach(([x, y], i) => {
      let on;
      let col = '#fde68a';
      if (mode === 'idle') on = still || (i + Math.floor(t * 5)) % 5 === 0 || (i + Math.floor(t * 5)) % 5 === 1;
      else if (mode === 'spin') on = still || (i + Math.floor(t * 24)) % 3 === 0;
      else if (mode === 'tease') {
        col = teaseCol;
        on = still || (i + Math.floor(t * 30)) % 2 === 0 || state.beat > 0.5;
      } else if (mode === 'win') {
        col = LINE_COLORS[winLine];
        on = still || (i + Math.floor(t * 10)) % 2 === 0;
      } else {
        const c = state.celebrate;
        col = c && c.level === 4 ? ((i + Math.floor(t * 12)) % 2 ? '#fbbf24' : '#f87171') : `hsl(${(i * 9 + t * 300) % 360}, 95%, 65%)`;
        on = still || (i + Math.floor(t * 16)) % 4 !== 0;
      }
      if (on) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x - 0.8, y - 0.8, 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#6b3d0a';
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawMachine() {
    const { x: fx, y: fy, w: fw, h: fh } = FRAME;
    // Gold frame.
    const frame = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    frame.addColorStop(0, '#fde68a');
    frame.addColorStop(0.5, '#b45309');
    frame.addColorStop(1, '#fcd34d');
    roundRect(fx, fy, fw, fh, 20);
    ctx.fillStyle = frame;
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawLights();
    roundRect(fx + 15, fy + 15, fw - 30, fh - 30, 10);
    ctx.fillStyle = '#12051f';
    ctx.fill();
    // Reel backgrounds and symbols.
    const teasing = state.phase === 'spin' && state.reels.some((r) => r.tease && !r.done);
    ctx.save();
    ctx.beginPath();
    ctx.rect(REEL_X, REEL_Y, CELL_W * REELS, CELL_H * ROWS);
    ctx.clip();
    for (let r = 0; r < REELS; r++) {
      const x = REEL_X + r * CELL_W;
      const g = ctx.createLinearGradient(x, REEL_Y, x, REEL_Y + CELL_H * ROWS);
      g.addColorStop(0, '#1c0d33');
      g.addColorStop(0.5, '#2e1854');
      g.addColorStop(1, '#1c0d33');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, REEL_Y, CELL_W - 4, CELL_H * ROWS);
      drawReel(r, x);
      // While another reel teases, the settled ones dim.
      const reel = state.reels[r];
      if (teasing && reel && reel.done) {
        ctx.fillStyle = 'rgba(5, 0, 15, 0.45)';
        ctx.fillRect(x, REEL_Y, CELL_W, CELL_H * ROWS);
      }
    }
    // Shade the top and bottom edges of the window.
    const shadeTop = ctx.createLinearGradient(0, REEL_Y, 0, REEL_Y + 30);
    shadeTop.addColorStop(0, 'rgba(0,0,0,0.6)');
    shadeTop.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadeTop;
    ctx.fillRect(REEL_X, REEL_Y, CELL_W * REELS, 30);
    const shadeBot = ctx.createLinearGradient(0, REEL_Y + CELL_H * ROWS - 30, 0, REEL_Y + CELL_H * ROWS);
    shadeBot.addColorStop(0, 'rgba(0,0,0,0)');
    shadeBot.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = shadeBot;
    ctx.fillRect(REEL_X, REEL_Y + CELL_H * ROWS - 30, CELL_W * REELS, 30);
    ctx.restore();
    // Thin dividers between reels.
    ctx.fillStyle = 'rgba(253, 230, 138, 0.18)';
    for (let r = 1; r < REELS; r++) ctx.fillRect(REEL_X + r * CELL_W - 1, REEL_Y, 2, CELL_H * ROWS);
    // Payline number tabs; hovering one previews its line.
    const winning = new Set(state.phase === 'result' && state.result ? state.result.lines.map((l) => l.line) : []);
    const hoverTab = state.mode === 'playing' && !state.feature && !state.showInfo ? tabAt(input.mx, input.my) : null;
    for (const tab of TABS) {
      const lit = winning.has(tab.line) || (hoverTab && hoverTab.line === tab.line);
      ctx.fillStyle = LINE_COLORS[tab.line];
      ctx.globalAlpha = winning.size && !lit ? 0.35 : 1;
      ctx.beginPath();
      ctx.arc(tab.x, tab.y, lit ? 10 : 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#1c0d33';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(tab.line + 1), tab.x, tab.y + 3.5);
      ctx.globalAlpha = 1;
    }
    if (hoverTab && !winning.size) drawPayline(hoverTab.line, 0.8);
  }

  // How far a stopped reel has bounced past its stop ("thunk").
  function bounce(reel) {
    if (!reel || !reel.done || reduced() || reel.stopT > 0.45) return 0;
    const t = reel.stopT;
    return 10 * Math.exp(-t * 11) * Math.sin(t * 28);
  }

  function drawReel(r, x) {
    const reel = state.reels[r];
    const spinning = state.phase === 'spin' && reel && !reel.done;
    if (!spinning) {
      const dy = bounce(reel);
      for (let row = 0; row < ROWS; row++) drawCell(state.grid[r][row], x, REEL_Y + row * CELL_H + dy, r, row);
      // Show a sliver of the symbol above while bouncing down.
      if (dy > 0.5) ctx.drawImage(sprite(reel.strip[ROWS] || 'ruby'), x, REEL_Y - CELL_H + dy, CELL_W, CELL_H);
      return;
    }
    if (reel.tease) {
      // Anticipation: a glowing column that beats with the heart.
      const col = reel.tease === 'orb' ? '34, 211, 238' : reel.tease === 'chest' ? '251, 191, 36' : '240, 171, 252';
      const a = 0.18 + state.beat * 0.3;
      const g = ctx.createLinearGradient(x, 0, x + CELL_W, 0);
      g.addColorStop(0, `rgba(${col}, ${a})`);
      g.addColorStop(0.5, `rgba(${col}, ${a * 0.3})`);
      g.addColorStop(1, `rgba(${col}, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, REEL_Y, CELL_W, CELL_H * ROWS);
    }
    // Mostly steady speed, easing a little at the end so the stop lands hard.
    const p = clamp(reel.t / reel.dur, 0, 1);
    const eased = 0.55 * p + 0.45 * (1 - Math.pow(1 - p, 2));
    const k = (reel.strip.length - ROWS) * (1 - eased);
    const blur = p < 0.9;
    for (let j = Math.max(0, Math.floor(k) - 1); j < Math.min(reel.strip.length, Math.floor(k) + ROWS + 1); j++) {
      const y = REEL_Y + (j - k) * CELL_H;
      if (blur) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(sprite(reel.strip[j]), x, y - 20, CELL_W, CELL_H);
        ctx.drawImage(sprite(reel.strip[j]), x, y + 20, CELL_W, CELL_H);
        ctx.globalAlpha = 0.75;
      }
      ctx.drawImage(sprite(reel.strip[j]), x, y, CELL_W, CELL_H);
      ctx.globalAlpha = 1;
    }
    if (reel.tease) {
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 12);
      ctx.strokeStyle = reel.tease === 'orb' ? `rgba(103, 232, 249, ${0.5 + pulse * 0.5})` : reel.tease === 'chest' ? `rgba(253, 224, 71, ${0.5 + pulse * 0.5})` : `rgba(240, 171, 252, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 4 + state.beat * 3;
      ctx.strokeRect(x + 3, REEL_Y + 3, CELL_W - 6, CELL_H * ROWS - 6);
    }
  }

  function winningCells() {
    const cells = new Set();
    if (!state.result) return cells;
    for (const l of state.result.lines) {
      for (let r = 0; r < l.count; r++) cells.add(`${r},${PAYLINES[l.line][r]}`);
    }
    if (state.result.orbs >= 3) state.result.orbCells.forEach(([r, row]) => cells.add(`${r},${row}`));
    if (state.result.chests >= 3) state.result.chestCells.forEach(([r, row]) => cells.add(`${r},${row}`));
    return cells;
  }

  function drawCell(id, x, y, r, row) {
    const showing = state.phase === 'result' && (state.win > 0 || (state.result && (state.result.pick || state.result.freeSpins)));
    const hit = showing && winningCells().has(`${r},${row}`);
    if (hit) {
      const pulse = reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(state.t * 8);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.12 + pulse * 0.12})`;
      ctx.fillRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
      ctx.save();
      ctx.translate(x + CELL_W / 2, y + CELL_H / 2);
      const sc = 1 + pulse * 0.08;
      ctx.scale(sc, sc);
      ctx.drawImage(sprite(id), -CELL_W / 2, -CELL_H / 2, CELL_W, CELL_H);
      ctx.restore();
    } else {
      ctx.globalAlpha = showing ? 0.4 : 1;
      ctx.drawImage(sprite(id), x, y, CELL_W, CELL_H);
      ctx.globalAlpha = 1;
    }
  }

  function linePoints(li) {
    const pts = [[REEL_X - 4, REEL_Y + PAYLINES[li][0] * CELL_H + CELL_H / 2]];
    PAYLINES[li].forEach((row, r) => pts.push([REEL_X + r * CELL_W + CELL_W / 2, REEL_Y + row * CELL_H + CELL_H / 2]));
    pts.push([REEL_X + REELS * CELL_W + 4, REEL_Y + PAYLINES[li][4] * CELL_H + CELL_H / 2]);
    return pts;
  }

  function drawPayline(li, alpha) {
    const pts = linePoints(li);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LINE_COLORS[li];
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.shadowColor = LINE_COLORS[li];
    ctx.shadowBlur = 10;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // The win line currently on show (all lines first, then one at a time).
  function shownLines() {
    const res = state.result;
    if (!res || !res.lines.length || state.phase !== 'result') return [];
    return state.lineT < 0.9 ? res.lines : [res.lines[Math.floor((state.lineT - 0.9) / 0.9) % res.lines.length]];
  }

  function drawWinLines() {
    const list = shownLines();
    for (const l of list) {
      drawPayline(l.line, 1);
      // A bright spark runs along the line.
      if (!reduced()) {
        const pts = linePoints(l.line);
        const u = (state.lineT * 1.4) % 1;
        const seg = u * (pts.length - 1);
        const i = Math.floor(seg);
        const f = seg - i;
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[Math.min(i + 1, pts.length - 1)];
        ctx.fillStyle = '#fff';
        ctx.shadowColor = LINE_COLORS[l.line];
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (list.length === 1 && !state.celebrate) {
      const l = list[0];
      const mult = state.fs ? FS_MULT : 1;
      const text = `Line ${l.line + 1} · ${l.count} × ${SYMBOLS[l.symbol].name} = ${fmt(l.win * mult)}`;
      ctx.font = 'bold 14px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 28;
      roundRect(W / 2 - w / 2, REEL_Y + CELL_H * ROWS - 32, w, 26, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fill();
      ctx.strokeStyle = LINE_COLORS[l.line];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = LINE_COLORS[l.line];
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, REEL_Y + CELL_H * ROWS - 14);
    }
  }

  function drawMeter() {
    const x = 20;
    const y = FRAME.y;
    const w = 134;
    const h = FRAME.h;
    roundRect(x, y, w, h, 14);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GEM WHEEL', x + w / 2, y + 24);
    const frac = clamp(state.meter.charge / METER_MAX, 0, 1);
    const tx = x + w / 2 - 15;
    const ty = y + 38;
    const th = h - 150;
    roundRect(tx, ty, 30, th, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    const fill = ctx.createLinearGradient(0, ty + th, 0, ty);
    fill.addColorStop(0, '#7c3aed');
    fill.addColorStop(1, '#f0abfc');
    if (frac > 0) {
      // Fill the tube from the bottom, clipped to its rounded shape.
      ctx.save();
      roundRect(tx, ty, 30, th, 15);
      ctx.clip();
      ctx.fillStyle = fill;
      ctx.fillRect(tx, ty + th * (1 - frac), 30, th * frac);
      // A shimmer rising through the charge.
      if (!reduced()) {
        const sy = ty + th - ((state.t * 60) % (th * frac + 1));
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(tx + 4, sy, 22, 3);
      }
      ctx.restore();
    }
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`${state.meter.charge}/${METER_MAX} spins`, x + w / 2, ty + th + 18);
    const spinRot = reduced() ? 0 : state.t * (0.5 + frac * 2);
    drawWheelDisc(ctx, x + w / 2, y + h - 52, 34, spinRot, WHEEL);
    gemIcon(x + w / 2, y + h - 52, 6);
  }

  // Lines of "where the win came from", best first.
  function breakdown() {
    const res = state.result;
    if (!res) return [];
    const mult = state.fs ? FS_MULT : 1;
    const out = res.lines
      .slice()
      .sort((a, b) => b.win - a.win)
      .map((l) => ({ line: l.line, sym: l.symbol, title: `${l.count} × ${SYMBOLS[l.symbol].name}`, sub: `Line ${l.line + 1}`, win: l.win * mult }));
    if (res.jackpot) out.unshift({ sym: 'wild', title: 'JACKPOT!', sub: '5 Wilds', win: state.jpWin, gold: true });
    if (res.orbs >= 3) {
      const spins = state.fs ? `+${FS_RETRIGGER} spins` : `${res.freeSpins} free spins`;
      out.push({ sym: 'orb', title: `${res.orbs} × Orb`, sub: spins, win: res.orbWin * mult });
    }
    if (res.pick) out.push({ sym: 'chest', title: `${res.chests} × Chest`, sub: 'Treasure Pick', win: 0 });
    return out;
  }

  function drawSidePanel() {
    const x = 846;
    const y = FRAME.y;
    const w = 138;
    const h = FRAME.h;
    roundRect(x, y, w, h, 14);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    let top = y;
    if (state.fs) {
      ctx.fillStyle = '#67e8f9';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillText('FREE SPINS', x + w / 2, y + 22);
      ctx.fillStyle = '#ecfeff';
      ctx.font = '900 32px system-ui, sans-serif';
      ctx.fillText(String(state.fs.left), x + w / 2, y + 56);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(`of ${state.fs.total} left · wins ×2`, x + w / 2, y + 73);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillText(`Won ${fmt(state.fs.win)}`, x + w / 2, y + 94);
      ctx.fillStyle = 'rgba(103, 232, 249, 0.3)';
      ctx.fillRect(x + 12, y + 104, w - 24, 1);
      top = y + 104;
    }
    const list = state.phase !== 'spin' ? breakdown() : [];
    if (list.length) {
      ctx.fillStyle = '#fde68a';
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.fillText('WIN CAME FROM', x + w / 2, top + 20);
      const cur = shownLines();
      const rowH = 36;
      const room = Math.floor((y + h - top - 62) / rowH);
      list.slice(0, room).forEach((e, i) => {
        const ry = top + 30 + i * rowH;
        const hot = cur.length === 1 && e.line === cur[0].line && e.line !== undefined;
        if (hot) {
          roundRect(x + 6, ry, w - 12, rowH - 4, 8);
          ctx.fillStyle = 'rgba(253, 224, 71, 0.15)';
          ctx.fill();
        }
        if (e.line !== undefined) {
          ctx.fillStyle = LINE_COLORS[e.line];
          ctx.beginPath();
          ctx.arc(x + 15, ry + 16, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1c0d33';
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(e.line + 1), x + 15, ry + 19);
        }
        ctx.drawImage(sprite(e.sym), x + 22, ry + 2, 30, 28);
        ctx.textAlign = 'left';
        ctx.fillStyle = e.gold ? '#fde047' : '#faf5ff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(e.title, x + 54, ry + 13);
        ctx.fillStyle = e.gold ? '#fde047' : 'rgba(233, 213, 255, 0.75)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(e.sub, x + 54, ry + 27);
        if (e.win > 0) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText(fmt(e.win), x + w - 10, ry + 27);
        }
      });
      ctx.textAlign = 'center';
      if (list.length > room) {
        ctx.fillStyle = '#e9d5ff';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`+${list.length - room} more`, x + w / 2, y + h - 40);
      }
      const total = state.win;
      ctx.fillStyle = 'rgba(253, 230, 138, 0.3)';
      ctx.fillRect(x + 12, y + h - 32, w - 24, 1);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillText(total > 0 ? `Total ${fmt(total)}` : 'Bonus!', x + w / 2, y + h - 12);
      return;
    }
    if (state.fs) {
      ctx.drawImage(sprite('orb'), x + w / 2 - 50, top + 40, 100, 93);
      ctx.fillStyle = '#a5f3fc';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('3+ orbs: +5 spins', x + w / 2, top + 150);
      return;
    }
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText('FEATURES', x + w / 2, y + 24);
    const rows = [
      ['orb', '3+ anywhere', 'Free spins, ×2'],
      ['chest', '3+ anywhere', 'Treasure pick'],
      ['wild', '5 on a line', 'JACKPOT'],
    ];
    rows.forEach(([id, a, b], i) => {
      const cy = y + 84 + i * 110;
      ctx.drawImage(sprite(id), x + w / 2 - 40, cy - 50, 80, 75);
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(a, x + w / 2, cy + 36);
      ctx.fillStyle = i === 2 ? '#fde047' : '#fef3c7';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(b, x + w / 2, cy + 52);
    });
  }

  function drawBottomBar() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 458, W, H - 458);
    const busy = state.phase !== 'idle' || state.feature;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('BET', 305, 478);
    roundRect(260, 486, 90, 40, 10);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.9)';
    ctx.fill();
    gemIcon(279, 506, 8);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(fmt(bet()), 316, 513);
    ctx.fillStyle = 'rgba(233, 213, 255, 0.6)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${LINES} lines · ${fmt(bet() / LINES)} each`, 305, 542);

    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(state.fs ? 'FREE SPIN WIN' : 'WIN', 530, 478);
    roundRect(430, 486, 200, 40, 10);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.9)';
    ctx.fill();
    if (state.phase === 'result' && state.shown < state.win) {
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = state.shown > 0 ? '#fde047' : 'rgba(254, 243, 199, 0.4)';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.fillText(fmt(state.shown), 530, 514);
    if (state.phase === 'result' && state.shown < state.win && !state.celebrate) {
      ctx.fillStyle = 'rgba(233, 213, 255, 0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText('tap to skip', 530, 542);
    }

    for (const b of bottomButtons()) {
      if (b.id === 'spin') drawSpinButton(b, busy);
      else if (b.id === 'daily') drawDailyButton(b);
      else if (b.id === 'turbo') drawButton(b, 'TURBO', turbo() ? 'active' : 'dark', 'bolt');
      else drawButton(b, b.label, b.id === 'auto' && state.auto > 0 ? 'active' : 'dark');
    }
    if (state.mode === 'playing' && state.phase === 'idle' && !state.feature && !state.fs && state.gems < BETS[0]) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      roundRect(W / 2 - 170, 200, 340, 140, 16);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('Out of gems', W / 2, 238);
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Have another free stack and keep playing.', W / 2, 262);
      drawButton(refillButton(), `Refill ${fmt(REFILL_GEMS)} gems`, 'gold');
    }
  }

  function drawDailyButton(b) {
    const ready = dailyReady();
    const hover = hoverHit;
    const hot = hover && hover.id === 'daily' && !b.disabled;
    const pulse = ready && !reduced() ? 0.5 + 0.5 * Math.sin(state.t * 4) : 0;
    ctx.globalAlpha = b.disabled && ready ? 0.55 : 1;
    ctx.save();
    if (ready) {
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8 + pulse * 12;
    }
    roundRect(b.x, b.y, b.w, b.h, 12);
    if (ready) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, hot ? '#fef08a' : '#fde047');
      g.addColorStop(1, '#d97706');
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(88, 28, 135, 0.35)';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ready ? '#fef3c7' : 'rgba(233, 213, 255, 0.25)';
    ctx.lineWidth = 1.5;
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.stroke();
    // A gift box.
    const gx = b.x + 26;
    const gy = b.y + b.h / 2 + 2;
    ctx.fillStyle = ready ? '#be185d' : 'rgba(233, 213, 255, 0.35)';
    ctx.fillRect(gx - 12, gy - 6, 24, 16);
    ctx.fillRect(gx - 14, gy - 11, 28, 6);
    ctx.fillStyle = ready ? '#fef3c7' : 'rgba(30, 10, 50, 0.8)';
    ctx.fillRect(gx - 2, gy - 11, 4, 21);
    ctx.textAlign = 'left';
    ctx.fillStyle = ready ? '#451a03' : 'rgba(233, 213, 255, 0.7)';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText('DAILY GIFT', b.x + 48, b.y + 20);
    ctx.font = '600 11px system-ui, sans-serif';
    let sub = 'Free spin ready!';
    if (!ready) {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const mins = Math.ceil((next - now) / 60000);
      sub = `Next in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    ctx.fillText(sub, b.x + 48, b.y + 36);
    ctx.globalAlpha = 1;
  }

  function drawSpinButton(b, busy) {
    const hover = hoverHit;
    const hot = hover && hover.id === 'spin';
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const idle = state.phase === 'idle' && !busy;
    // Breathing glow when it's ready.
    if (idle && !reduced()) {
      ctx.fillStyle = `rgba(253, 224, 71, ${0.12 + 0.1 * Math.sin(state.t * 3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2 + 7, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, b.w / 2);
    g.addColorStop(0, hot ? '#fef08a' : '#fde047');
    g.addColorStop(1, '#b45309');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#451a03';
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = state.auto > 0 && !state.fs ? 'STOP' : state.phase === 'spin' ? 'STOP' : state.fs ? 'FREE' : 'SPIN';
    ctx.fillText(label, cx, cy - (state.auto > 0 && !state.fs ? 6 : 0) + 1);
    if (state.auto > 0 && !state.fs) {
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(`auto ${state.auto}`, cx, cy + 12);
    }
    ctx.textBaseline = 'alphabetic';
    if (busy && state.phase !== 'spin') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hold progress ring.
    const h = input.hold;
    if (h && !h.fired && h.t > 0.1) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(h.t / HOLD_AUTO, 0, 1));
      ctx.stroke();
    }
  }

  function drawIcon(name, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (name === 'cards') {
      ctx.save();
      ctx.translate(cx - 3, cy + 1);
      ctx.rotate(-0.25);
      ctx.strokeRect(-5, -7, 10, 14);
      ctx.restore();
      ctx.save();
      ctx.translate(cx + 3, cy);
      ctx.rotate(0.15);
      ctx.fillRect(-5, -7, 10, 14);
      ctx.restore();
    } else if (name === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 3.6 : 8.5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + 1 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (name === 'sound' || name === 'muted') {
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 3);
      ctx.lineTo(cx - 4, cy - 3);
      ctx.lineTo(cx + 1, cy - 8);
      ctx.lineTo(cx + 1, cy + 8);
      ctx.lineTo(cx - 4, cy + 3);
      ctx.lineTo(cx - 8, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      if (name === 'sound') {
        ctx.arc(cx + 2, cy, 5, -0.8, 0.8);
        ctx.moveTo(cx + 5.5, cy - 7);
        ctx.arc(cx + 2, cy, 9, -0.8, 0.8);
      } else {
        ctx.moveTo(cx + 4, cy - 4);
        ctx.lineTo(cx + 10, cy + 4);
        ctx.moveTo(cx + 10, cy - 4);
        ctx.lineTo(cx + 4, cy + 4);
      }
      ctx.stroke();
    } else if (name === 'full') {
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * 8, cy + sy * 3);
        ctx.lineTo(cx + sx * 8, cy + sy * 8);
        ctx.lineTo(cx + sx * 3, cy + sy * 8);
        ctx.stroke();
      }
    } else if (name === 'menu') {
      for (const dy of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + dy);
        ctx.lineTo(cx + 8, cy + dy);
        ctx.stroke();
      }
    } else if (name === 'bolt') {
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 9);
      ctx.lineTo(cx - 5, cy + 1);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx - 2, cy + 9);
      ctx.lineTo(cx + 5, cy - 1);
      ctx.lineTo(cx, cy - 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawButton(b, label, style, icon) {
    const hover = hoverHit;
    const hot = hover && hover.id === b.id && !b.disabled;
    ctx.globalAlpha = b.disabled ? 0.4 : 1;
    roundRect(b.x, b.y, b.w, b.h, b.r || 10);
    if (style === 'gold') {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, hot ? '#fef08a' : '#fde047');
      g.addColorStop(1, '#d97706');
      ctx.fillStyle = g;
    } else if (style === 'active') ctx.fillStyle = hot ? '#c084fc' : '#a855f7';
    else ctx.fillStyle = hot ? 'rgba(168, 85, 247, 0.55)' : 'rgba(88, 28, 135, 0.6)';
    ctx.fill();
    ctx.strokeStyle = style === 'gold' ? '#fef3c7' : 'rgba(233, 213, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const color = style === 'gold' ? '#451a03' : '#faf5ff';
    const ic = icon || b.icon;
    if (ic && !label) drawIcon(ic, b.x + b.w / 2, b.y + b.h / 2, color);
    else {
      ctx.fillStyle = color;
      ctx.font = `bold ${b.font || 14}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tx = ic ? b.x + b.w / 2 + 9 : b.x + b.w / 2;
      ctx.fillText(label, tx, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
      if (ic) drawIcon(ic, tx - ctx.measureText(label).width / 2 - 11, b.y + b.h / 2, color);
    }
    ctx.globalAlpha = 1;
  }

  // Dim the machine and spin a sunburst behind the coins.
  function drawCelebrateBack() {
    const c = state.celebrate;
    const tier = TIERS[c.level];
    const appear = clamp(c.t / 0.35, 0, 1);
    ctx.fillStyle = `rgba(6, 2, 16, ${0.6 * appear})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const cx = W / 2;
    const cy = 236;
    // Sunburst rays.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reduced() ? 0 : state.t * 0.4);
    ctx.globalAlpha = 0.16 * appear;
    ctx.fillStyle = tier.color;
    for (let i = 0; i < 18; i++) {
      ctx.rotate((Math.PI * 2) / 18);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(700, -70);
      ctx.lineTo(700, 70);
      ctx.fill();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 300);
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.25 * appear})`);
    glow.addColorStop(0.4, tier.color + '55');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // The tier title and the counting meter, in front of the coins.
  function drawCelebrate() {
    const c = state.celebrate;
    const tier = TIERS[c.level];
    const appear = clamp(c.t / 0.35, 0, 1);
    const cx = W / 2;
    const cy = 236;
    // The tier title pops with each new tier.
    const pop = reduced() ? 1 : (0.4 + 0.6 * easeOutBack(appear)) * (1 + c.punch * 0.25);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    if (!reduced()) ctx.rotate(Math.sin(state.t * 3) * 0.025);
    const size = 72 + c.level * 8;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.1);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, tier.color);
    g.addColorStop(1, tier.deep);
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e0b36';
    ctx.strokeText(tier.label, 0, 0);
    ctx.fillStyle = g;
    ctx.fillText(tier.label, 0, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeText(tier.label, 0, 0);
    ctx.restore();
    // The counting win meter.
    ctx.save();
    ctx.translate(cx, cy + 82);
    const amtScale = c.done && !reduced() ? 1 + 0.05 * Math.sin(state.t * 6) : 1;
    ctx.scale(amtScale, amtScale);
    roundRect(-180, -42, 360, 62, 31);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.85)';
    ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    const amount = fmt(c.shown);
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(amount).width;
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(amount, 14, 4);
    gemIcon(14 - tw / 2 - 22, -11, 14);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(`${(c.shown / c.bet).toFixed(1)}× bet`, cx, cy + 132);
    ctx.fillStyle = `rgba(233, 213, 255, ${0.5 + 0.3 * Math.sin(state.t * 4)})`;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(c.done ? 'Tap or press Space to continue' : 'Tap or press Space to skip', cx, cy + 170);
  }

  function drawParts() {
    for (const p of state.parts) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      if (p.kind === 'coin') {
        // A spinning coin: squash its width as it turns.
        const sx = Math.abs(Math.cos(p.rot)) * p.size + 0.8;
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.ellipse(0, 0, sx, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = Math.cos(p.rot) > 0 ? '#fbbf24' : '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(0, 0, sx * 0.78, p.size * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 251, 235, 0.8)';
        ctx.beginPath();
        ctx.ellipse(-sx * 0.25, -p.size * 0.3, sx * 0.22, p.size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        gemPath(ctx, 0, 0, p.size, 6, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        gemPath(ctx, 0, 0, p.size * 0.45, 6, 0);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawToast(t) {
    const slide = Math.min(1, t.t / 0.25) * Math.min(1, (2.8 - t.t) / 0.25);
    const w = 280;
    const h = 52;
    const x = 12 - (1 - slide) * (w + 20);
    const y = 60;
    ctx.globalAlpha = clamp(slide, 0, 1);
    roundRect(x, y, w, h, 14);
    ctx.fillStyle = 'rgba(20, 8, 40, 0.94)';
    ctx.fill();
    ctx.strokeStyle = t.card ? RARITY[t.card.rarity].color : '#fcd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (t.card) drawCard(ctx, t.card, x + 10, y + 6, 30, 40, true);
    else drawIcon('star', x + 26, y + h / 2, '#fde047');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde68a';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(t.title, x + 52, y + 21);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(t.text, x + 52, y + 40);
    ctx.globalAlpha = 1;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(5, 2, 12, 0.72)';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3b0764');
    g.addColorStop(1, '#1e0b36');
    roundRect(x, y, w, h, 18);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function heading(text, sub, y) {
    ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(0, y - 30, 0, y);
    g.addColorStop(0, '#fef9c3');
    g.addColorStop(1, '#f59e0b');
    ctx.font = '900 32px system-ui, sans-serif';
    ctx.fillStyle = g;
    ctx.fillText(text, W / 2, y);
    if (sub) {
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(sub, W / 2, y + 26);
    }
  }

  function drawFeature() {
    const f = state.feature;
    const pop = reduced() ? 1 : 0.85 + 0.15 * easeOutBack(clamp(f.t / 0.3, 0, 1));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(pop, pop);
    ctx.translate(-W / 2, -H / 2);
    if (f.type === 'fsIntro') {
      panel(250, 120, 500, 320);
      const bob = reduced() ? 0 : Math.sin(state.t * 3) * 6;
      ctx.drawImage(sprite('orb'), W / 2 - 66, 136 + bob, 132, 123);
      heading(`${f.spins} FREE SPINS`, 'Every win is doubled. More orbs add 5 more spins.', 300);
      ctx.fillStyle = '#a5f3fc';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`Playing at a bet of ${fmt(f.bet)}`, W / 2, 346);
      drawButton(featureButtons()[0], 'Start', 'gold');
    } else if (f.type === 'retrigger') {
      panel(300, 180, 400, 200);
      heading(`+${f.spins} FREE SPINS`, 'The orbs gave you more spins.', 260);
      drawButton(featureButtons()[0], 'Keep going', 'gold');
    } else if (f.type === 'fsSummary') {
      panel(280, 150, 440, 260);
      heading('FREE SPINS OVER', 'You won', 220);
      ctx.fillStyle = '#fde047';
      ctx.font = '900 44px system-ui, sans-serif';
      ctx.fillText(fmt(f.win), W / 2, 300);
      drawButton(featureButtons()[0], 'Collect', 'gold');
    } else if (f.type === 'pick') {
      drawPick(f);
    } else if (f.type === 'wheel' || f.type === 'daily') {
      drawWheelFeature(f);
    }
    ctx.restore();
  }

  function drawPick(f) {
    panel(200, 70, 600, 440);
    heading('TREASURE PICK', f.left ? `Pick ${f.left} more chest${f.left > 1 ? 's' : ''}` : `You found ${fmt(f.total * f.bet)} gems`, 112);
    const hover = hoverHit;
    featureButtons().forEach((b) => {
      if (!b.id.startsWith('chest:')) return;
      const k = Number(b.id.slice(6));
      const open = f.open.includes(k);
      const revealAll = f.left === 0;
      const hot = hover && hover.id === b.id && !open && f.left > 0;
      roundRect(b.x, b.y, b.w, b.h, 12);
      ctx.fillStyle = open ? 'rgba(253, 224, 71, 0.2)' : hot ? 'rgba(168, 85, 247, 0.5)' : 'rgba(15, 5, 30, 0.6)';
      ctx.fill();
      if (open) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (open || revealAll) {
        // Opened prizes pop in.
        const age = open && f.openT ? state.t - f.openT[k] : 1;
        const sc = reduced() ? 1 : 0.6 + 0.4 * easeOutBack(clamp(age / 0.35, 0, 1));
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.scale(sc, sc);
        ctx.globalAlpha = open ? 1 : 0.4;
        gemIcon(0, -17, 14);
        ctx.fillStyle = '#fde047';
        ctx.font = '900 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${f.prizes[k]}×`, 0, 23);
        ctx.fillStyle = '#e9d5ff';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(fmt(f.prizes[k] * f.bet), 0, 39);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        const bob = hot && !reduced() ? Math.sin(state.t * 10) * 2 : 0;
        ctx.drawImage(sprite('chest'), b.x + b.w / 2 - 45, b.y + 6 + bob, 90, 84);
      }
    });
    if (f.left === 0) drawButton(featureButtons().find((b) => b.id === 'collect'), 'Collect', 'gold');
  }

  function drawWheelFeature(f) {
    const daily = f.type === 'daily';
    panel(240, 60, 520, 460);
    let sub = '';
    if (!f.done) sub = daily ? 'Your free daily spin. Every slice is gems!' : `Prizes are multiples of your average bet (${fmt(f.bet)})`;
    heading(daily ? 'DAILY GIFT' : 'GEM WHEEL', sub, 100);
    const cx = W / 2;
    const cy = 312;
    const r = 146;
    const seg = (Math.PI * 2) / f.slices.length;
    f.slices.forEach((s, i) => {
      const a0 = f.angle + i * seg;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a0 + seg);
      ctx.closePath();
      ctx.fill();
      // The winning slice glows once the wheel stops.
      if (f.done && i === f.slot) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(state.t * 8)})`;
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${s.label.length > 5 ? 11 : 16}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, r - 12, 0);
      ctx.restore();
    });
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Lights around the rim.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ctx.fillStyle = (Math.floor(state.t * (f.spinning ? 14 : 6)) + k) % 2 ? '#fef9c3' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    gemIcon(cx, cy, 12);
    // Pointer, flicking back as it passes each peg.
    ctx.save();
    ctx.translate(cx, cy - r - 14);
    ctx.rotate(-(f.tick || 0) * 0.35);
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(-14, 0);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (!daily && !f.done) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Jackpot slice pays ${fmt(state.jackpot * f.bet)}`, cx, 146);
    }
    const btn = featureButtons()[0];
    if (f.done) {
      const s = f.slices[f.slot];
      ctx.fillStyle = '#fde047';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.fs ? `${s.fs} FREE SPINS!` : s.jackpot ? `JACKPOT! ${fmt(f.prize)}` : `${fmt(f.prize)} gems`, cx, 140);
      drawButton(btn, 'Collect', 'gold');
    } else {
      drawButton({ ...btn, disabled: f.spinning }, 'Spin the wheel', 'gold');
    }
  }

  function drawInfo() {
    panel(90, 30, 820, 500);
    const b = bet();
    const lb = b / LINES;
    if (state.showInfo === 1) {
      heading('PAYTABLE', `Your bet: ${fmt(b)} (${fmt(lb)} a line). Wins pay left to right, in gems.`, 74);
      const ids = ['diamond', 'seven', 'crown', 'wild', 'emerald', 'amethyst', 'ruby', 'sapphire'];
      ids.forEach((id, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 118 + col * 196;
        const y = 116 + row * 116;
        ctx.drawImage(sprite(id), x, y, 88, 82);
        const p = SYMBOLS[id].pays;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(SYMBOLS[id].name, x + 90, y + 18);
        ctx.font = '13px system-ui, sans-serif';
        [5, 4, 3].forEach((n, k) => {
          ctx.fillStyle = '#c4b5fd';
          ctx.fillText(`${n}×`, x + 90, y + 40 + k * 18);
          ctx.fillStyle = '#fde047';
          ctx.fillText(fmt(p[n] * lb), x + 112, y + 40 + k * 18);
        });
        if (id === 'wild') {
          ctx.fillStyle = '#f0abfc';
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.fillText('+ JACKPOT on 5', x + 90, y + 92);
        }
      });
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '13px system-ui, sans-serif';
      const lines = [
        'Wild stands in for every symbol except orbs and chests.',
        `Orbs anywhere: 3 = ${fmt(ORB_PAY[3] * b)} + ${ORB_SPINS[3]} free spins · 4 = ${fmt(ORB_PAY[4] * b)} + ${ORB_SPINS[4]} · 5 = ${fmt(ORB_PAY[5] * b)} + ${ORB_SPINS[5]}`,
        `Chests anywhere: 3, 4 or 5 = pick that many chests (up to ${fmt(15 * b)} each).`,
        `Progressive jackpot right now: ${fmt(state.jackpot * b)}.`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, 368 + i * 22));
    } else {
      heading('LINES & BONUSES', 'Ten paylines, read left to right. Hover a numbered tab by the reels to see one.', 74);
      PAYLINES.forEach((line, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const x = 140 + col * 148;
        const y = 116 + row * 76;
        ctx.fillStyle = LINE_COLORS[i];
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Line ${i + 1}`, x, y);
        for (let r = 0; r < REELS; r++) {
          for (let rr = 0; rr < ROWS; rr++) {
            ctx.fillStyle = line[r] === rr ? LINE_COLORS[i] : 'rgba(255,255,255,0.1)';
            ctx.fillRect(x + r * 20, y + 8 + rr * 15, 18, 13);
          }
        }
      });
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '13px system-ui, sans-serif';
      const lines = [
        `Free Spins: ${ORB_SPINS[3]}–${ORB_SPINS[5]} spins at your bet, all wins ×${FS_MULT}. 3+ orbs again add ${FS_RETRIGGER} more.`,
        'Treasure Pick: open chests for 1× to 15× your bet each.',
        `Gem Wheel: every ${METER_MAX} paid spins, a free spin of the wheel for up to 20×, free spins or the jackpot.`,
        `Jackpot: starts at ${JP_SEED}× your bet and grows with every paid spin. Won by 5 Wilds on a line or the Jackpot slice.`,
        'Daily Gift: one free gift-wheel spin each day. Bonuses earn gem cards for your album.',
        'Space spins (tap again to stop), hold for auto spin. ↑ ↓ bet · A auto · T turbo · I pays.',
        'Play gems only. There is no real money and nothing to buy.',
      ];
      lines.forEach((l, i) => ctx.fillText(l, W / 2, 290 + i * 24));
    }
    for (const btn of infoButtons()) {
      const active = (btn.id === 'info-1' && state.showInfo === 1) || (btn.id === 'info-2' && state.showInfo === 2);
      drawButton(btn, btn.label, btn.id === 'info-close' ? 'gold' : active ? 'active' : 'dark');
    }
  }

  // The first-play guide: a spotlight on each part of the machine.
  const GUIDE = [
    { r: [782, 458, 96, 96], title: 'Spin', text: 'Tap SPIN or press Space. Tap again to stop the reels early. Hold it down to start auto spin.' },
    { r: [206, 468, 196, 82], title: 'Your bet', text: 'Pick a bet from 10 to 500 gems. Every pay in the paytable scales with it.' },
    { r: [362, 42, 276, 46], title: 'Progressive jackpot', text: 'A slice of every bet grows the jackpot. Land 5 Wilds on a line, or the Jackpot slice on the Gem Wheel, to win it.' },
    { r: [16, FRAME.y - 4, 142, FRAME.h + 8], title: 'Gem Wheel', text: `Every ${METER_MAX} paid spins charge the Gem Wheel for a free prize spin.` },
    { r: [842, FRAME.y - 4, 146, FRAME.h + 8], title: 'Bonuses and wins', text: '3+ orbs give free spins, 3+ chests open a Treasure Pick. After a win, this panel lists exactly where it came from.' },
    { r: [14, 478, 172, 56], title: 'Daily gift', text: 'Once a day, spin the gift wheel for free gems. Bonuses also earn gem cards for your album.' },
    { r: [644, 480, 108, 52], title: 'Auto spin', text: 'AUTO plays 10 spins in a row. Tap SPIN to stop it.' },
    { r: [880, 480, 110, 52], title: 'Turbo', text: 'Quick spins: shorter reel spins and faster counting. Press T to toggle.' },
    { r: [750, 4, 246, 46], title: 'Everything else', text: 'Gem card album, achievements, paytable, sound, fullscreen and settings (including reduced motion). Play gems only: no real money, nothing to buy.' },
  ];

  function guideBox() {
    const step = GUIDE[state.guide];
    const [rx, ry, rw, rh] = step.r;
    ctx.font = '14px system-ui, sans-serif';
    const w = 340;
    const lines = wrapText(step.text, w - 36);
    const h = 64 + lines.length * 20 + 46;
    let x;
    let y;
    if (rh > 200) {
      x = rx < W / 2 ? rx + rw + 16 : rx - w - 16;
      y = ry + rh / 2 - h / 2;
    } else {
      x = rx + rw / 2 - w / 2;
      y = ry + rh / 2 > H / 2 ? ry - h - 14 : ry + rh + 14;
    }
    x = clamp(x, 12, W - w - 12);
    y = clamp(y, 12, H - h - 12);
    return { x, y, w, h, lines, step };
  }

  function guideButtons() {
    const b = guideBox();
    const last = state.guide === GUIDE.length - 1;
    return [
      { id: 'guide-next', label: last ? "Let's play" : 'Next', x: b.x + b.w - 130, y: b.y + b.h - 46, w: 112, h: 32, font: 14 },
      { id: 'guide-skip', label: 'Skip guide', x: b.x + 18, y: b.y + b.h - 46, w: 100, h: 32, font: 12, hidden: last },
    ].filter((x) => !x.hidden);
  }

  function drawGuide() {
    const box = guideBox();
    const [rx, ry, rw, rh] = box.step.r;
    // Dim everything except the spotlight.
    ctx.fillStyle = 'rgba(5, 2, 12, 0.72)';
    ctx.beginPath();
    ctx.rect(-20, -20, W + 40, H + 40);
    ctx.roundRect(rx, ry, rw, rh, 14);
    ctx.fill('evenodd');
    const pulse = reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(state.t * 5);
    ctx.strokeStyle = `rgba(253, 224, 71, ${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    roundRect(rx, ry, rw, rh, 14);
    ctx.stroke();
    roundRect(box.x, box.y, box.w, box.h, 14);
    ctx.fillStyle = '#2e1065';
    ctx.fill();
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde68a';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(`QUICK GUIDE · ${state.guide + 1} / ${GUIDE.length}`, box.x + 18, box.y + 24);
    ctx.fillStyle = '#fff';
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillText(box.step.title, box.x + 18, box.y + 48);
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '14px system-ui, sans-serif';
    box.lines.forEach((l, i) => ctx.fillText(l, box.x + 18, box.y + 72 + i * 20));
    for (const b of guideButtons()) drawButton(b, b.label, b.id === 'guide-next' ? 'gold' : 'dark');
  }

  function guideNext() {
    Sound.click();
    if (state.guide < GUIDE.length - 1) state.guide++;
    else endGuide();
  }

  function endGuide() {
    state.guide = null;
    state.guideDone = true;
    save();
  }

  // ---------------------------------------------------------------------------
  // Buttons and input
  // ---------------------------------------------------------------------------

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const find = (list, x, y) => list.find((b) => inside(b, x, y)) || null;

  function topButtons() {
    const ids = [
      ['album', 'cards', 'Gem card album'],
      ['trophies', 'star', 'Achievements'],
      ['info', null, 'Paytable'],
      ['mute', Sound.muted ? 'muted' : 'sound', 'Sound'],
      ['full', 'full', 'Fullscreen'],
      ['menu', 'menu', 'Menu and settings'],
    ];
    return ids.map(([id, icon], k) => ({ id, icon, label: id === 'info' ? 'i' : '', x: W - 246 + k * 40, y: 9, w: 34, h: 32, font: 17 }));
  }

  function bottomButtons() {
    const idle = state.phase === 'idle' && !state.feature && !state.fs && !state.celebrate;
    return [
      { id: 'bet-', label: '−', x: 214, y: 486, w: 40, h: 40, font: 20, disabled: !idle || state.betIndex === 0 },
      { id: 'bet+', label: '+', x: 356, y: 486, w: 40, h: 40, font: 20, disabled: !idle || state.betIndex === BETS.length - 1 },
      { id: 'auto', label: state.auto > 0 ? `AUTO ${state.auto}` : 'AUTO 10', x: 650, y: 486, w: 96, h: 40, font: 12, disabled: !!state.fs },
      { id: 'spin', x: 790, y: 464, w: 80, h: 80 },
      { id: 'daily', x: 18, y: 482, w: 164, h: 48, disabled: !idle || !dailyReady() },
      { id: 'turbo', x: 884, y: 486, w: 102, h: 40, font: 13 },
    ];
  }

  function refillButton() {
    return { id: 'refill', x: W / 2 - 110, y: 282, w: 220, h: 42 };
  }

  function infoButtons() {
    return [
      { id: 'info-1', label: 'Pays', x: W / 2 - 230, y: 486, w: 120, h: 30, font: 13 },
      { id: 'info-2', label: 'Lines & bonuses', x: W / 2 - 100, y: 486, w: 160, h: 30, font: 13 },
      { id: 'info-close', label: 'Close', x: W / 2 + 110, y: 486, w: 120, h: 30, font: 13 },
    ];
  }

  function featureButtons() {
    const f = state.feature;
    if (!f) return [];
    if (f.type === 'fsIntro') return [{ id: 'fs-start', x: W / 2 - 90, y: 364, w: 180, h: 46, font: 18 }];
    if (f.type === 'retrigger') return [{ id: 'ok', x: W / 2 - 80, y: 310, w: 160, h: 42 }];
    if (f.type === 'fsSummary') return [{ id: 'ok', x: W / 2 - 80, y: 335, w: 160, h: 46, font: 18 }];
    if (f.type === 'wheel' || f.type === 'daily') return [{ id: f.done ? 'collect' : 'wheel-spin', x: W / 2 - 100, y: 466, w: 200, h: 40, font: 16 }];
    if (f.type === 'pick') {
      const btns = [];
      for (let k = 0; k < 9; k++) {
        btns.push({ id: `chest:${k}`, x: 290 + (k % 3) * 146, y: 150 + Math.floor(k / 3) * 104, w: 128, h: 94 });
      }
      btns.push({ id: 'collect', x: W / 2 - 80, y: 462, w: 160, h: 40, font: 16 });
      return btns;
    }
    return [];
  }

  function hitTest(x, y) {
    if (!state || state.mode !== 'playing') return null;
    if (state.guide !== null) return find(guideButtons(), x, y);
    if (state.showInfo) return find(infoButtons(), x, y);
    const top = topButtons();
    if (state.celebrate) {
      return find(top.filter((b) => b.id === 'mute' || b.id === 'full'), x, y) || (x >= 0 && y >= 0 ? { id: 'celebrate' } : null);
    }
    if (state.feature) {
      return find(featureButtons(), x, y) || find(top.filter((b) => b.id === 'info' || b.id === 'mute' || b.id === 'full'), x, y);
    }
    if (state.gems < BETS[0] && state.phase === 'idle' && !state.fs && inside(refillButton(), x, y)) return refillButton();
    for (const b of [...top, ...bottomButtons()]) {
      if (b.id === 'spin' ? Math.hypot(x - (b.x + 40), y - (b.y + 40)) < 42 : inside(b, x, y)) return b;
    }
    return null;
  }

  // Spin, or stop auto spin if it's running. Returns true if it spun.
  function pressSpin() {
    if (state.auto > 0 && !state.fs) {
      state.auto = 0;
      if (state.phase === 'spin') slam();
      Sound.click();
      return false;
    }
    spin();
    return true;
  }

  function activate(b) {
    if (!b || b.disabled) return;
    const id = b.id;
    if (id === 'mute') toggleMute();
    else if (id === 'full') toggleFullscreen();
    else if (id === 'menu') showMenu();
    else if (id === 'album') showMenu('album');
    else if (id === 'trophies') showMenu('trophies');
    else if (id === 'info') { state.showInfo = 1; Sound.click(); }
    else if (id === 'info-1' || id === 'info-2') { state.showInfo = id === 'info-1' ? 1 : 2; Sound.click(); }
    else if (id === 'info-close') { state.showInfo = 0; Sound.click(); }
    else if (id === 'guide-next') guideNext();
    else if (id === 'guide-skip') { endGuide(); Sound.click(); }
    else if (id === 'celebrate') skipCelebrate();
    else if (id === 'refill') { state.gems += REFILL_GEMS; save(); Sound.fanfare(); }
    else if (id === 'daily') startFeature({ type: 'daily' });
    else if (id === 'turbo') { state.settings.turbo = !turbo(); save(); Sound.click(); }
    else if (id === 'bet-' || id === 'bet+') {
      state.betIndex = clamp(state.betIndex + (id === 'bet+' ? 1 : -1), 0, BETS.length - 1);
      save();
      Sound.click();
    } else if (id === 'auto') {
      state.auto = state.auto > 0 ? 0 : 10;
      Sound.click();
      if (state.auto && state.phase === 'idle' && !state.pendingSpin) {
        state.auto--;
        spin();
      }
    } else if (id === 'spin') {
      if (pressSpin() && !state.fs) input.hold = { t: 0, fired: false };
    } else featureClick(id);
  }

  // Space / Enter: whatever the obvious next thing is.
  function primaryAction() {
    if (state.guide !== null) return guideNext();
    if (state.showInfo) {
      state.showInfo = 0;
      return;
    }
    if (state.celebrate) return skipCelebrate();
    const f = state.feature;
    if (f) {
      if (f.type === 'pick' && f.left > 0) {
        const closed = [...Array(9).keys()].filter((i) => !f.open.includes(i));
        featureClick(`chest:${closed[Math.floor(Math.random() * closed.length)]}`);
      } else {
        const btns = featureButtons().filter((b) => !b.id.startsWith('chest:'));
        if (btns.length && !((f.type === 'wheel' || f.type === 'daily') && f.spinning)) featureClick(btns[0].id);
      }
      return;
    }
    if (pressSpin() && !state.fs) input.hold = { t: 0, fired: false };
  }

  function toggleMute() {
    Sound.muted = !Sound.muted;
    save();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay): main menu with settings, album, achievements
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');
  let menuPage = 'main';

  function onOff(v) {
    return v ? 'On' : 'Off';
  }

  function showMenu(page = 'main') {
    if (!state) newState();
    state.mode = 'menu';
    state.auto = 0;
    input.hold = null;
    menuPage = page;
    const owned = CARDS.filter((c) => state.cards[c.id]).length;
    const done = ACHIEVEMENTS.filter((a) => state.ach[a.id]).length;
    const back = `<div class="row"><button type="button" class="primary" data-act="play">Back to the reels</button><button type="button" data-act="main">Menu</button></div>`;
    if (page === 'album') {
      overlay.innerHTML = `
        <div class="nw-page">
          <h2>Gem card album</h2>
          <p>${owned} of ${CARDS.length} cards. Bonus features (free spins, treasure picks, wheels and daily gifts) each earn a card; the jackpot gives a legendary. Complete the album for ${fmt(ALBUM_BONUS)} gems.</p>
          <div class="nw-album">${CARDS.map((c) => `<figure><img alt="${state.cards[c.id] ? c.name : 'Unknown ' + RARITY[c.rarity].name + ' card'}" src="${cardImage(c, !!state.cards[c.id])}">${state.cards[c.id] > 1 ? `<span>×${state.cards[c.id]}</span>` : ''}</figure>`).join('')}</div>
          ${back}
        </div>`;
    } else if (page === 'trophies') {
      overlay.innerHTML = `
        <div class="nw-page">
          <h2>Achievements</h2>
          <p>${done} of ${ACHIEVEMENTS.length} unlocked.</p>
          <ul class="nw-ach">${ACHIEVEMENTS.map((a) => `<li class="${state.ach[a.id] ? 'got' : ''}"><b>${state.ach[a.id] ? '★' : '☆'} ${a.name}</b><span>${a.text}</span></li>`).join('')}</ul>
          ${back}
        </div>`;
    } else {
      const s = state.settings;
      overlay.innerHTML = `
        <div class="nw-page">
          <h2>Nameless Slots</h2>
          <p>Spin five reels of gems. Land orbs for free spins, chests for treasure, and fill the Gem Wheel for a shot at the progressive jackpot.</p>
          <div class="row"><button type="button" class="primary" data-act="play">${state.spins ? 'Continue' : 'Play'}</button></div>
          ${dailyReady() ? '<p class="nw-gift">Your free daily gift is ready: tap DAILY GIFT on the machine.</p>' : ''}
          <div class="row">
            <button type="button" data-act="album">Gem cards ${owned}/${CARDS.length}</button>
            <button type="button" data-act="trophies">Achievements ${done}/${ACHIEVEMENTS.length}</button>
            <button type="button" data-act="pays">Paytable</button>
          </div>
          <div class="row nw-settings">
            <button type="button" data-act="turbo" aria-pressed="${s.turbo}">Turbo spins: ${onOff(s.turbo)}</button>
            <button type="button" data-act="reduced" aria-pressed="${s.reduced}">Reduced motion: ${onOff(s.reduced)}</button>
            <button type="button" data-act="mute" aria-pressed="${!Sound.muted}">Sound: ${onOff(!Sound.muted)}</button>
            <button type="button" data-act="guide">Show the guide</button>
          </div>
          <p class="help">You have ${fmt(state.gems)} gems. Space spins (hold for auto) · ↑ ↓ bet · A auto · T turbo · I pays · M mute · F fullscreen</p>
          <p class="help">Play gems only: no real money, nothing to buy.</p>
        </div>`;
    }
    overlay.classList.add('open');
    overlay.scrollTop = 0;
  }

  // Card art as an image for the album (drawn at 2× for sharpness).
  const cardImages = new Map();
  function cardImage(card, owned) {
    const key = card.id + owned;
    if (!cardImages.has(key)) {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 320;
      const g = c.getContext('2d');
      drawCard(g, card, 0, 0, 240, 320, owned);
      cardImages.set(key, c.toDataURL('image/png'));
    }
    return cardImages.get(key);
  }

  function play() {
    state.mode = 'playing';
    overlay.classList.remove('open');
    overlay.innerHTML = '';
    if (!state.guideDone && state.guide === null) state.guide = 0;
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    Sound.click();
    const act = b.dataset.act;
    if (act === 'play') play();
    else if (act === 'main' || act === 'album' || act === 'trophies') showMenu(act);
    else if (act === 'pays') {
      play();
      state.showInfo = 1;
    } else if (act === 'guide') {
      state.guideDone = false;
      state.guide = null;
      play();
    } else if (act === 'turbo' || act === 'reduced') {
      state.settings[act] = !state.settings[act];
      save();
      showMenu('main');
    } else if (act === 'mute') {
      toggleMute();
      showMenu('main');
    }
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
  });
  canvas.addEventListener('pointerleave', () => {
    input.mx = -1;
    input.my = -1;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    const hit = hitTest(p.x, p.y);
    if (hit) activate(hit);
    else if (state.mode === 'playing' && state.phase === 'result' && !state.feature) finishResult();
  });
  window.addEventListener('pointerup', () => { input.hold = null; });
  window.addEventListener('pointercancel', () => { input.hold = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !state || state.mode !== 'playing') return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (e.repeat) return; // holding is handled by the hold timer
      primaryAction();
      return;
    }
    if (state.guide !== null) {
      if (k === 'escape') endGuide();
      else return;
    } else if (k === 'escape' && state.showInfo) state.showInfo = 0;
    else if (k === 'arrowup') activate(bottomButtons()[1]);
    else if (k === 'arrowdown') activate(bottomButtons()[0]);
    else if (k === 'a') activate(bottomButtons()[2]);
    else if (k === 't') activate({ id: 'turbo' });
    else if (k === 'i') state.showInfo = state.showInfo ? 0 : 1;
    else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFullscreen();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') input.hold = null;
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state) {
      step(dt);
      updateParts(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing.
  window.__slots = {
    get state() { return state; },
    simulate,
    evaluate,
    spin,
    play,
    featureClick,
    finishResult,
    // Tests: make the next spin land on a given grid (reels of three symbols).
    force(grid) { state.forceGrid = grid; },
    // Tests and screenshots: show a celebration for x times the bet.
    celebrate(x, jackpot) { startCelebration(Math.round(x * bet()), bet(), !!jackpot, false); },
    skip: skipCelebrate,
    awardCard,
    unlock,
    openDaily() { startFeature({ type: 'daily' }); },
    CARDS,
    ACHIEVEMENTS,
  };

  newState();
  showMenu();
  requestAnimationFrame(frame);
})();
