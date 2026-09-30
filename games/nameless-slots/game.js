'use strict';

// Nameless Slots: a five-reel gem slot machine with free spins, a treasure
// pick bonus and a prize wheel. Play gems only: no real money, nothing to buy.
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
  const BIG_WIN = 15; // multiples of the bet for the big win banners
  const MEGA_WIN = 35;
  const EPIC_WIN = 80;

  const params = new URLSearchParams(location.search);
  const TURBO = params.has('turbo');

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
    { label: 'JACKPOT', mult: 100, color: '#eab308', jackpot: true },
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
    };
  }

  function pickBonus(picks) {
    const prizes = shuffle(CHEST_PRIZES);
    return prizes.slice(0, picks).reduce((s, v) => s + v, 0);
  }

  // Monte Carlo return-to-player, for tuning (window.__slots.simulate).
  function simulate(n) {
    const bet = 100;
    let paid = 0;
    let won = 0;
    let base = 0;
    let fsWon = 0;
    let pickWon = 0;
    let wheelWon = 0;
    let hits = 0;
    let fsTriggers = 0;
    let picks = 0;
    let wheels = 0;
    let meter = 0;
    const runFree = (spins) => {
      let total = 0;
      while (spins > 0) {
        spins--;
        const res = evaluate(randomGrid(), bet);
        total += res.total * FS_MULT;
        if (res.pick) total += pickBonus(res.pick) * bet;
        if (res.orbs >= 3) spins += FS_RETRIGGER;
      }
      return total;
    };
    for (let i = 0; i < n; i++) {
      paid += bet;
      meter++;
      const res = evaluate(randomGrid(), bet);
      if (res.total > 0) hits++;
      base += res.total;
      won += res.total;
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
        const v = slice.fs ? runFree(slice.fs) : slice.mult * bet;
        wheelWon += v;
        won += v;
      }
    }
    return {
      rtp: +(won / paid).toFixed(4),
      base: +(base / paid).toFixed(4),
      freeSpins: +(fsWon / paid).toFixed(4),
      pick: +(pickWon / paid).toFixed(4),
      wheel: +(wheelWon / paid).toFixed(4),
      hitRate: +(hits / n).toFixed(3),
      fsEvery: Math.round(n / Math.max(1, fsTriggers)),
      pickEvery: Math.round(n / Math.max(1, picks)),
      wheels,
    };
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

    spin() { this.play('spin', 0.1, () => this.tone(220, 0.25, 'triangle', 0.05, 440)); },
    tick() { this.play('tick', 0.05, () => this.tone(1400, 0.02, 'square', 0.015)); },
    stop() { this.play('stop', 0.04, () => this.tone(160, 0.1, 'sine', 0.12, 90)); },
    tease() { this.play('tease', 0.3, () => this.tone(500, 0.5, 'triangle', 0.05, 900)); },
    land(k) { this.play('land' + k, 0.05, () => this.tone(660 * Math.pow(1.26, k), 0.18, 'triangle', 0.07)); },
    win(size) {
      this.play('win', 0.2, () => {
        const notes = size > 2 ? [523, 659, 784, 1047, 1319] : size > 1 ? [523, 659, 784, 1047] : [659, 880];
        notes.forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.07, null, i * 0.08));
      });
    },
    count() { this.play('count', 0.06, () => this.tone(1800 + Math.random() * 400, 0.03, 'sine', 0.02)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
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
      return JSON.parse(localStorage.getItem('nameless-slots')) || null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem('nameless-slots', JSON.stringify({
        gems: state.gems, bet: state.betIndex, meter: state.meter, biggest: state.biggest, spins: state.spins,
      }));
    } catch {
      // Storage can be unavailable (private mode); progress just isn't kept.
    }
  }

  let state = null;
  const input = { mx: -1, my: -1 };

  function newState() {
    const saved = loadSave();
    state = {
      mode: 'menu',
      phase: 'idle', // 'idle' | 'spin' | 'result' | 'feature'
      gems: saved ? saved.gems : START_GEMS,
      betIndex: saved ? clamp(saved.bet, 0, BETS.length - 1) : 1,
      meter: saved && saved.meter ? saved.meter : { charge: 0, betSum: 0 },
      biggest: saved ? saved.biggest || 0 : 0,
      spins: saved ? saved.spins || 0 : 0,
      grid: randomGrid(),
      reels: [],
      result: null,
      win: 0, // amount won on the current spin, counted up on screen
      shown: 0,
      resultT: 0,
      lineT: 0,
      fs: null, // { left, total, bet, win }
      queue: [],
      feature: null,
      auto: 0,
      banner: null,
      parts: [],
      t: 0,
      showInfo: false,
    };
  }

  const bet = () => (state.fs ? state.fs.bet : BETS[state.betIndex]);

  function canSpin() {
    return state.mode === 'playing' && !state.feature && !state.showInfo;
  }

  function spin() {
    if (!canSpin()) return;
    if (state.phase === 'spin') {
      // Pressing again slams the reels to a stop.
      for (const r of state.reels) r.dur = Math.min(r.dur, r.t + 0.12 + r.i * 0.05);
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
    } else {
      state.fs.left--;
    }
    state.grid = state.forceGrid || randomGrid();
    state.forceGrid = null;
    state.result = evaluate(state.grid, b);
    state.win = 0;
    state.shown = 0;
    state.banner = null;
    startReels();
    state.phase = 'spin';
    Sound.spin();
  }

  // Build a strip per reel that ends on the result, and time the stops. When
  // two orbs or chests are already showing, the remaining reels slow down.
  function startReels() {
    const speed = TURBO ? 0.35 : 1;
    let tease = false;
    let orbs = 0;
    let chests = 0;
    state.reels = state.grid.map((col, i) => {
      if (orbs >= 2 || chests >= 2) tease = true;
      orbs += col.filter((s) => s === 'orb').length;
      chests += col.filter((s) => s === 'chest').length;
      const extra = 10 + i * 4 + (tease ? 14 : 0);
      const strip = [...col];
      for (let k = 0; k < extra; k++) strip.push(randomSymbol(i));
      return {
        i, strip, t: 0, done: false, tease,
        dur: (0.55 + i * 0.18 + (tease ? 1.1 : 0)) * speed,
      };
    });
  }

  function updateReels(dt) {
    let allDone = true;
    state.reels.forEach((r) => {
      if (r.done) return;
      r.t += dt;
      if (r.tease && r.t < r.dur && Math.random() < dt * 4) Sound.tease();
      if (r.t >= r.dur) {
        r.done = true;
        Sound.stop();
        const col = state.grid[r.i];
        if (col.includes('orb') || col.includes('chest')) Sound.land(r.i);
      } else {
        allDone = false;
        if (Math.random() < dt * 20) Sound.tick();
      }
    });
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
    if (state.win > 0) {
      const x = state.win / b;
      const tier = x >= EPIC_WIN ? 3 : x >= MEGA_WIN ? 2 : x >= BIG_WIN ? 1 : 0;
      if (tier) {
        state.banner = { text: ['', 'BIG WIN', 'MEGA WIN', 'EPIC WIN'][tier], t: 0, tier };
        gemShower(20 + tier * 25);
      }
      Sound.win(tier);
    }
    if (state.fs) state.fs.win += state.win;
    if (res.pick) state.queue.push({ type: 'pick', picks: res.pick });
    if (res.freeSpins) {
      if (state.fs) {
        state.fs.left += FS_RETRIGGER;
        state.fs.total += FS_RETRIGGER;
        state.queue.push({ type: 'retrigger', spins: FS_RETRIGGER });
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
    if (!state.fs) credit(state.win);
    state.shown = state.win;
    state.phase = 'idle';
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
        state.pendingSpin = 0.5;
      } else {
        state.feature = { type: 'fsSummary', win: state.fs.win, t: 0 };
        Sound.fanfare();
      }
      return;
    }
    if (state.auto > 0) {
      state.auto--;
      state.pendingSpin = 0.35;
    }
  }

  // ---------------------------------------------------------------------------
  // Features
  // ---------------------------------------------------------------------------

  function startFeature(f) {
    state.auto = 0;
    if (f.type === 'pick') {
      state.feature = { type: 'pick', picks: f.picks, left: f.picks, prizes: shuffle(CHEST_PRIZES), open: [], total: 0, bet: bet(), t: 0 };
      Sound.fanfare();
    } else if (f.type === 'fsIntro') {
      state.feature = { type: 'fsIntro', spins: f.spins, bet: state.wheelFsBet || bet(), t: 0 };
      state.wheelFsBet = null;
      Sound.fanfare();
    } else if (f.type === 'retrigger') {
      state.feature = { type: 'retrigger', spins: f.spins, t: 0 };
      Sound.fanfare();
    } else if (f.type === 'wheel') {
      const avg = Math.max(BETS[0], Math.round(state.meter.betSum / Math.max(1, state.meter.charge)));
      state.meter = { charge: 0, betSum: 0 };
      save();
      state.feature = { type: 'wheel', bet: avg, angle: 0, spinning: false, done: false, t: 0 };
      Sound.fanfare();
    }
  }

  function featureClick(id) {
    const f = state.feature;
    if (!f) return;
    if (f.type === 'fsIntro' && id === 'fs-start') {
      state.fs = { left: f.spins, total: f.spins, bet: f.bet, win: 0 };
      state.feature = null;
      Sound.click();
      nextStep();
    } else if (f.type === 'retrigger' && id === 'ok') {
      state.feature = null;
      nextStep();
    } else if (f.type === 'fsSummary' && id === 'ok') {
      credit(f.win);
      state.shown = f.win;
      state.fs = null;
      state.feature = null;
      nextStep();
    } else if (f.type === 'pick') {
      if (id.startsWith('chest:') && f.left > 0) {
        const k = Number(id.slice(6));
        if (f.open.includes(k)) return;
        f.open.push(k);
        f.left--;
        f.total += f.prizes[k];
        Sound.reveal(f.prizes[k]);
        if (f.left === 0) f.doneT = 0;
      } else if (id === 'collect' && f.left === 0) {
        const amount = f.total * f.bet;
        if (state.fs) state.fs.win += amount;
        else credit(amount);
        state.shown = amount;
        state.feature = null;
        Sound.win(amount / f.bet >= BIG_WIN ? 2 : 1);
        nextStep();
      }
    } else if (f.type === 'wheel') {
      if (id === 'wheel-spin' && !f.spinning && !f.done) {
        const slot = Math.floor(Math.random() * WHEEL.length);
        f.slot = slot;
        const seg = (Math.PI * 2) / WHEEL.length;
        // The pointer is at the top; land the chosen slice's centre under it.
        const target = -Math.PI / 2 - (slot + 0.5) * seg;
        f.from = f.angle;
        f.to = target - Math.PI * 2 * 6 + rand(-0.3, 0.3) * seg;
        while (f.to > f.from - Math.PI * 8) f.to -= Math.PI * 2;
        f.spinT = 0;
        f.spinning = true;
        Sound.spin();
      } else if (id === 'collect' && f.done) {
        const s = WHEEL[f.slot];
        state.feature = null;
        if (s.fs) {
          state.queue.unshift({ type: 'fsIntro', spins: s.fs });
          // Free spins from the wheel play at the wheel's bet.
          state.wheelFsBet = f.bet;
        } else {
          credit(s.mult * f.bet);
          state.shown = s.mult * f.bet;
        }
        nextStep();
      }
    }
  }

  function updateFeature(dt) {
    const f = state.feature;
    if (!f) return;
    f.t += dt;
    if (f.type === 'wheel' && f.spinning) {
      f.spinT += dt;
      const dur = 4.2;
      const p = Math.min(1, f.spinT / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const prev = f.angle;
      f.angle = f.from + (f.to - f.from) * eased;
      const seg = (Math.PI * 2) / WHEEL.length;
      if (Math.floor(prev / seg) !== Math.floor(f.angle / seg)) Sound.tick();
      if (p >= 1) {
        f.spinning = false;
        f.done = true;
        const s = WHEEL[f.slot];
        if (s.jackpot) gemShower(120);
        else gemShower(30);
        Sound.win(s.jackpot ? 3 : 2);
      }
    }
  }

  function gemShower(n) {
    for (let k = 0; k < n; k++) {
      state.parts.push({
        x: rand(100, W - 100), y: rand(-200, -10), vx: rand(-40, 40), vy: rand(60, 260),
        rot: rand(0, 6), vr: rand(-4, 4), life: rand(2, 3.5),
        color: ['#f43f5e', '#38bdf8', '#34d399', '#c084fc', '#fde047'][k % 5], size: rand(6, 12),
      });
    }
  }

  function step(dt) {
    state.t += dt;
    if (state.mode !== 'playing') return;
    if (state.phase === 'spin') updateReels(dt);
    else if (state.phase === 'result') {
      state.resultT += dt;
      state.lineT += dt;
      // Count the win up.
      if (state.shown < state.win) {
        state.shown = Math.min(state.win, state.shown + Math.max(1, state.win * dt * (state.banner ? 0.5 : 2)));
        Sound.count();
      }
      const hold = state.banner ? 3 : state.win > 0 ? 1.1 : 0.25;
      const auto = state.auto > 0 || state.fs;
      if (state.resultT > hold && (auto || state.queue.length || state.win === 0)) finishResult();
      else if (state.resultT > hold + 1.5) finishResult();
    }
    if (state.pendingSpin !== undefined && state.pendingSpin !== null) {
      state.pendingSpin -= dt;
      if (state.pendingSpin <= 0) {
        state.pendingSpin = null;
        spin();
      }
    }
    if (state.banner) state.banner.t += dt;
    updateFeature(dt);
  }

  function updateParts(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    state.parts = state.parts.filter((p) => p.life > 0 && p.y < H + 40);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const sprites = new Map();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
    sprites.clear();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  // Symbols are drawn once per size into offscreen canvases.
  function sprite(id) {
    if (!sprites.has(id)) {
      const s = canvas.width / W;
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
      g.lineWidth = 7;
      g.strokeStyle = '#450a0a';
      g.strokeText('7', cx, cy + r * 0.08);
      g.fillStyle = grad;
      g.fillText('7', cx, cy + r * 0.08);
      g.lineWidth = 2;
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
      g.lineWidth = 4;
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
        g.lineTo(cx + Math.cos(a) * rr, cy - 4 + Math.sin(a) * rr);
      }
      g.fill();
      g.font = `900 ${r * 0.36}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
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
      g.roundRect(cx - r * 0.95, cy - r * 0.1, r * 1.9, r * 0.95, 5);
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
    }
    g.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const fs = state && state.fs;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, fs ? '#0c2a3a' : '#1e0b36');
    bg.addColorStop(1, fs ? '#041018' : '#0a0418');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    if (!state) return;
    drawBackdrop();
    drawTopBar();
    drawMachine();
    drawMeter();
    drawSidePanel();
    drawBottomBar();
    if (state.phase === 'result' || (state.phase === 'idle' && state.result && state.shown > 0)) drawWinLines();
    if (state.banner) drawBanner();
    if (state.feature) drawFeature();
    if (state.showInfo) drawInfo();
    for (const p of state.parts) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      gemPath(ctx, 0, 0, p.size, 6, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      gemPath(ctx, 0, 0, p.size * 0.45, 6, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const hover = hitTest(input.mx, input.my);
    canvas.style.cursor = hover && !hover.disabled ? 'pointer' : 'default';
  }

  function drawBackdrop() {
    // Soft floating sparkles.
    for (let k = 0; k < 40; k++) {
      const x = (k * 97.3 + state.t * (5 + (k % 7))) % W;
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
    ctx.fillText('NAMELESS SLOTS', 20, 36);
    // Balance.
    roundRect(W / 2 - 110, 9, 220, 36, 18);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    gemIcon(W / 2 - 85, 27, 10);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmt(state.gems), W / 2 + 8, 34);
    for (const b of topButtons()) drawButton(b, b.label, 'dark');
  }

  function drawMachine() {
    // Gold frame.
    const fx = REEL_X - 16;
    const fy = REEL_Y - 16;
    const fw = CELL_W * REELS + 32;
    const fh = CELL_H * ROWS + 32;
    const frame = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    frame.addColorStop(0, '#fde68a');
    frame.addColorStop(0.5, '#b45309');
    frame.addColorStop(1, '#fcd34d');
    roundRect(fx, fy, fw, fh, 18);
    ctx.fillStyle = frame;
    ctx.fill();
    roundRect(fx + 6, fy + 6, fw - 12, fh - 12, 13);
    ctx.fillStyle = '#12051f';
    ctx.fill();
    // Reel backgrounds.
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
    // Payline number tabs.
    PAYLINES.forEach((line, i) => {
      const y = REEL_Y + line[0] * CELL_H + CELL_H / 2 + (i % 3 - 1) * 14;
      ctx.fillStyle = LINE_COLORS[i];
      ctx.beginPath();
      ctx.arc(REEL_X - 8, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c0d33';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), REEL_X - 8, y + 3);
    });
  }

  function drawReel(r, x) {
    const reel = state.reels[r];
    const spinning = state.phase === 'spin' && reel && !reel.done;
    if (!spinning) {
      for (let row = 0; row < ROWS; row++) drawCell(state.grid[r][row], x, REEL_Y + row * CELL_H, r, row);
      if (reel && reel.tease === false) return;
      return;
    }
    const p = clamp(reel.t / reel.dur, 0, 1);
    const k = (reel.strip.length - ROWS) * (1 - easeOutBack(p));
    const blur = p < 0.85;
    for (let j = Math.max(0, Math.floor(k) - 1); j < Math.min(reel.strip.length, Math.floor(k) + ROWS + 1); j++) {
      const y = REEL_Y + (j - k) * CELL_H;
      if (blur) {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(sprite(reel.strip[j]), x, y - 18, CELL_W, CELL_H);
        ctx.drawImage(sprite(reel.strip[j]), x, y + 18, CELL_W, CELL_H);
        ctx.globalAlpha = 0.7;
      }
      ctx.drawImage(sprite(reel.strip[j]), x, y, CELL_W, CELL_H);
      ctx.globalAlpha = 1;
    }
    if (reel.tease) {
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 12);
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 4;
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
    const showing = state.phase === 'result' && state.win > 0 || state.phase === 'result' && state.result && (state.result.pick || state.result.freeSpins);
    const hit = showing && winningCells().has(`${r},${row}`);
    if (hit) {
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 8);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.12 + pulse * 0.12})`;
      ctx.fillRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
      ctx.save();
      ctx.translate(x + CELL_W / 2, y + CELL_H / 2);
      const sc = 1 + pulse * 0.06;
      ctx.scale(sc, sc);
      ctx.drawImage(sprite(id), -CELL_W / 2, -CELL_H / 2, CELL_W, CELL_H);
      ctx.restore();
    } else {
      ctx.globalAlpha = showing ? 0.45 : 1;
      ctx.drawImage(sprite(id), x, y, CELL_W, CELL_H);
      ctx.globalAlpha = 1;
    }
  }

  function drawWinLines() {
    const res = state.result;
    if (!res || !res.lines.length || state.phase !== 'result') return;
    // Show all lines briefly, then cycle through them.
    const list = state.lineT < 0.9 ? res.lines : [res.lines[Math.floor((state.lineT - 0.9) / 0.9) % res.lines.length]];
    for (const l of list) {
      ctx.strokeStyle = LINE_COLORS[l.line];
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.shadowColor = LINE_COLORS[l.line];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      PAYLINES[l.line].forEach((row, r) => {
        const x = REEL_X + r * CELL_W + CELL_W / 2;
        const y = REEL_Y + row * CELL_H + CELL_H / 2;
        if (r) ctx.lineTo(x, y);
        else ctx.moveTo(REEL_X - 4, y);
      });
      ctx.lineTo(REEL_X + REELS * CELL_W + 4, REEL_Y + PAYLINES[l.line][4] * CELL_H + CELL_H / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (list.length === 1) {
      const l = list[0];
      const mult = state.fs ? FS_MULT : 1;
      const text = `Line ${l.line + 1}: ${l.count} × ${SYMBOLS[l.symbol].name} = ${fmt(l.win * mult)}`;
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 24;
      roundRect(W / 2 - w / 2, REEL_Y + CELL_H * ROWS - 30, w, 24, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fill();
      ctx.fillStyle = LINE_COLORS[l.line];
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, REEL_Y + CELL_H * ROWS - 13);
    }
  }

  function drawMeter() {
    const x = 50;
    const y = 96;
    const w = 90;
    const h = 330;
    roundRect(x, y - 16, w, h + 30, 14);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.7)';
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GEM WHEEL', x + w / 2, y + 2);
    const frac = clamp(state.meter.charge / METER_MAX, 0, 1);
    const tx = x + w / 2 - 14;
    const ty = y + 14;
    const th = h - 90;
    roundRect(tx, ty, 28, th, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    const fill = ctx.createLinearGradient(0, ty + th, 0, ty);
    fill.addColorStop(0, '#7c3aed');
    fill.addColorStop(1, '#f0abfc');
    roundRect(tx, ty + th * (1 - frac), 28, th * frac, 14);
    ctx.fillStyle = fill;
    if (frac > 0) ctx.fill();
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(`${state.meter.charge}/${METER_MAX}`, x + w / 2, ty + th + 16);
    drawMiniWheel(x + w / 2, y + h - 30, 26, state.t * 0.5);
  }

  function drawMiniWheel(cx, cy, r, rot) {
    const seg = (Math.PI * 2) / WHEEL.length;
    WHEEL.forEach((s, i) => {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, rot + i * seg, rot + (i + 1) * seg);
      ctx.fill();
    });
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSidePanel() {
    const x = 860;
    const y = 80;
    const w = 120;
    roundRect(x, y, w, 346, 14);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.7)';
    ctx.fill();
    ctx.textAlign = 'center';
    if (state.fs) {
      ctx.fillStyle = '#67e8f9';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillText('FREE SPINS', x + w / 2, y + 26);
      ctx.fillStyle = '#ecfeff';
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.fillText(String(state.fs.left), x + w / 2, y + 74);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(`of ${state.fs.total} left`, x + w / 2, y + 94);
      ctx.fillText('All wins ×2', x + w / 2, y + 122);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('Won so far', x + w / 2, y + 160);
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.fillText(fmt(state.fs.win), x + w / 2, y + 184);
      return;
    }
    ctx.fillStyle = '#fde68a';
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.fillText('FEATURES', x + w / 2, y + 22);
    const rows = [
      ['orb', '3+ anywhere', 'Free spins, ×2'],
      ['chest', '3+ anywhere', 'Treasure pick'],
      ['wild', 'Substitutes', 'Pays the most'],
    ];
    rows.forEach(([id, a, b], i) => {
      const cy = y + 70 + i * 100;
      ctx.drawImage(sprite(id), x + w / 2 - 36, cy - 44, 72, 67);
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(a, x + w / 2, cy + 32);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(b, x + w / 2, cy + 46);
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
    gemIcon(282, 506, 8);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(fmt(bet()), 316, 513);
    ctx.fillStyle = 'rgba(233, 213, 255, 0.6)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${LINES} lines`, 305, 542);

    ctx.fillStyle = '#e9d5ff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(state.fs ? 'FREE SPIN WIN' : 'WIN', 530, 478);
    roundRect(430, 486, 200, 40, 10);
    ctx.fillStyle = 'rgba(15, 5, 30, 0.9)';
    ctx.fill();
    ctx.fillStyle = state.shown > 0 ? '#fde047' : 'rgba(254, 243, 199, 0.4)';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.fillText(fmt(state.shown), 530, 514);

    for (const b of bottomButtons()) {
      if (b.id === 'spin') drawSpinButton(b, busy);
      else drawButton(b, b.label, b.id === 'auto' && state.auto > 0 ? 'active' : 'dark');
    }
    if (state.mode === 'playing' && state.phase === 'idle' && !state.feature && !state.fs && state.gems < BETS[0]) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
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

  function drawSpinButton(b, busy) {
    const hover = hitTest(input.mx, input.my);
    const hot = hover && hover.id === 'spin';
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
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
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.phase === 'spin' ? 'STOP' : state.fs ? 'FREE' : 'SPIN', cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
    if (busy && state.phase !== 'spin') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawButton(b, label, style) {
    const hover = hitTest(input.mx, input.my);
    const hot = hover && hover.id === b.id && !b.disabled;
    ctx.globalAlpha = b.disabled ? 0.4 : 1;
    roundRect(b.x, b.y, b.w, b.h, b.r || 10);
    if (style === 'gold') {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, hot ? '#fef08a' : '#fde047');
      g.addColorStop(1, '#d97706');
      ctx.fillStyle = g;
    } else if (style === 'active') ctx.fillStyle = '#a855f7';
    else ctx.fillStyle = hot ? 'rgba(168, 85, 247, 0.55)' : 'rgba(88, 28, 135, 0.6)';
    ctx.fill();
    ctx.strokeStyle = style === 'gold' ? '#fef3c7' : 'rgba(233, 213, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = style === 'gold' ? '#451a03' : '#faf5ff';
    ctx.font = `bold ${b.font || 14}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    const bn = state.banner;
    const p = Math.min(1, bn.t / 0.4);
    const scale = 0.5 + 0.5 * easeOutBack(p);
    ctx.save();
    ctx.translate(W / 2, 250);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp((3.2 - bn.t) * 2, 0, 1);
    const g = ctx.createLinearGradient(0, -40, 0, 20);
    g.addColorStop(0, '#fef9c3');
    g.addColorStop(0.5, '#fde047');
    g.addColorStop(1, '#f59e0b');
    ctx.font = `900 ${58 + bn.tier * 8}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#3b0764';
    ctx.strokeText(bn.text, 0, 0);
    ctx.fillStyle = g;
    ctx.fillText(bn.text, 0, 0);
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeText(fmt(state.shown), 0, 48);
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(fmt(state.shown), 0, 48);
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(5, 2, 12, 0.72)';
    ctx.fillRect(0, 0, W, H);
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
    if (f.type === 'fsIntro') {
      panel(250, 130, 500, 300);
      ctx.drawImage(sprite('orb'), W / 2 - 60, 150, CELL_W, CELL_H);
      heading(`${f.spins} FREE SPINS`, 'Every win is doubled. More orbs add 5 more spins.', 300);
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
      panel(200, 70, 600, 440);
      heading('TREASURE PICK', f.left ? `Pick ${f.left} more chest${f.left > 1 ? 's' : ''}` : `You found ${fmt(f.total * f.bet)} gems`, 112);
      const hover = hitTest(input.mx, input.my);
      featureButtons().forEach((b) => {
        if (!b.id.startsWith('chest:')) return;
        const k = Number(b.id.slice(6));
        const open = f.open.includes(k);
        const revealAll = f.left === 0;
        const hot = hover && hover.id === b.id && !open && f.left > 0;
        roundRect(b.x, b.y, b.w, b.h, 12);
        ctx.fillStyle = open ? 'rgba(253, 224, 71, 0.2)' : hot ? 'rgba(168, 85, 247, 0.5)' : 'rgba(15, 5, 30, 0.6)';
        ctx.fill();
        if (open || revealAll) {
          ctx.globalAlpha = open ? 1 : 0.4;
          gemIcon(b.x + b.w / 2, b.y + 30, 14);
          ctx.fillStyle = '#fde047';
          ctx.font = '900 20px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${f.prizes[k]}×`, b.x + b.w / 2, b.y + 70);
          ctx.fillStyle = '#e9d5ff';
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillText(fmt(f.prizes[k] * f.bet), b.x + b.w / 2, b.y + 86);
          ctx.globalAlpha = 1;
        } else {
          const bob = hot ? Math.sin(state.t * 10) * 2 : 0;
          ctx.drawImage(sprite('chest'), b.x + b.w / 2 - 45, b.y + 6 + bob, 90, 84);
        }
      });
      if (f.left === 0) drawButton(featureButtons().find((b) => b.id === 'collect'), 'Collect', 'gold');
    } else if (f.type === 'wheel') {
      panel(240, 60, 520, 460);
      heading('GEM WHEEL', f.done ? '' : `Prizes are multiples of your average bet (${fmt(f.bet)})`, 100);
      const cx = W / 2;
      const cy = 312;
      const r = 146;
      const seg = (Math.PI * 2) / WHEEL.length;
      WHEEL.forEach((s, i) => {
        const a0 = f.angle + i * seg;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a0 + seg);
        ctx.closePath();
        ctx.fill();
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
        ctx.fillStyle = (Math.floor(state.t * 6) + k) % 2 ? '#fef9c3' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      gemIcon(cx, cy, 12);
      // Pointer.
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 16);
      ctx.lineTo(cx - 14, cy - r - 14);
      ctx.lineTo(cx + 14, cy - r - 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.stroke();
      const btn = featureButtons()[0];
      if (f.done) {
        const s = WHEEL[f.slot];
        ctx.fillStyle = '#fde047';
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.fs ? `${s.fs} FREE SPINS!` : s.jackpot ? `JACKPOT! ${fmt(s.mult * f.bet)}` : `${fmt(s.mult * f.bet)} gems`, cx, 136);
        drawButton(btn, 'Collect', 'gold');
      } else {
        drawButton({ ...btn, disabled: f.spinning }, 'Spin the wheel', 'gold');
      }
    }
  }

  function drawInfo() {
    panel(120, 40, 760, 480);
    heading('PAYS', `Line wins are multiples of the line bet (${fmt(bet() / LINES)}). Wins pay left to right.`, 84);
    const ids = ['diamond', 'seven', 'crown', 'wild', 'emerald', 'amethyst', 'ruby', 'sapphire'];
    ids.forEach((id, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 150 + col * 180;
      const y = 130 + row * 130;
      ctx.drawImage(sprite(id), x, y, 84, 78);
      const p = SYMBOLS[id].pays;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(SYMBOLS[id].name, x + 86, y + 22);
      ctx.fillStyle = '#e9d5ff';
      ctx.font = '12px system-ui, sans-serif';
      [5, 4, 3].forEach((n, k) => ctx.fillText(`${n}× ${p[n]}`, x + 86, y + 42 + k * 16));
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '13px system-ui, sans-serif';
    const lines = [
      'Wild stands in for every symbol except orbs and chests.',
      `3, 4 or 5 orbs anywhere: ${ORB_SPINS[3]}, ${ORB_SPINS[4]} or ${ORB_SPINS[5]} free spins, and ${ORB_PAY[3]}×, ${ORB_PAY[4]}× or ${ORB_PAY[5]}× your bet. Free spin wins are doubled.`,
      '3, 4 or 5 chests anywhere: pick that many treasure chests.',
      `Every ${METER_MAX} paid spins fill the Gem Wheel: spin it for up to a 100× jackpot.`,
      'Play gems only. There is no real money and nothing to buy.',
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 400 + i * 20));
    drawButton(infoClose(), 'Close', 'gold');
  }

  // ---------------------------------------------------------------------------
  // Buttons and input
  // ---------------------------------------------------------------------------

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function topButtons() {
    return [
      { id: 'info', label: 'i', x: W - 166, y: 11, w: 34, h: 32, font: 16 },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪', x: W - 126, y: 11, w: 34, h: 32 },
      { id: 'full', label: '⛶', x: W - 86, y: 11, w: 34, h: 32 },
      { id: 'menu', label: '≡', x: W - 46, y: 11, w: 34, h: 32 },
    ];
  }

  function bottomButtons() {
    const idle = state.phase === 'idle' && !state.feature && !state.fs;
    return [
      { id: 'bet-', label: '−', x: 214, y: 486, w: 40, h: 40, font: 20, disabled: !idle || state.betIndex === 0 },
      { id: 'bet+', label: '+', x: 356, y: 486, w: 40, h: 40, font: 20, disabled: !idle || state.betIndex === BETS.length - 1 },
      { id: 'auto', label: state.auto > 0 ? `AUTO ${state.auto}` : 'AUTO ×10', x: 650, y: 486, w: 96, h: 40, font: 12, disabled: !!state.fs },
      { id: 'spin', x: 790, y: 464, w: 80, h: 80 },
    ];
  }

  function refillButton() {
    return { id: 'refill', x: W / 2 - 110, y: 282, w: 220, h: 42 };
  }

  function infoClose() {
    return { id: 'info-close', x: W / 2 - 60, y: 488, w: 120, h: 24, font: 12 };
  }

  function featureButtons() {
    const f = state.feature;
    if (!f) return [];
    if (f.type === 'fsIntro') return [{ id: 'fs-start', x: W / 2 - 90, y: 352, w: 180, h: 46, font: 18 }];
    if (f.type === 'retrigger') return [{ id: 'ok', x: W / 2 - 80, y: 310, w: 160, h: 42 }];
    if (f.type === 'fsSummary') return [{ id: 'ok', x: W / 2 - 80, y: 335, w: 160, h: 46, font: 18 }];
    if (f.type === 'wheel') return [{ id: f.done ? 'collect' : 'wheel-spin', x: W / 2 - 100, y: 466, w: 200, h: 40, font: 16 }];
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
    if (state.showInfo) return inside(infoClose(), x, y) ? infoClose() : null;
    if (state.feature) {
      for (const b of featureButtons()) if (inside(b, x, y)) return b;
      for (const b of topButtons()) if (b.id !== 'info' && b.id !== 'menu' && inside(b, x, y)) return b;
      return null;
    }
    if (state.gems < BETS[0] && state.phase === 'idle' && !state.fs && inside(refillButton(), x, y)) return refillButton();
    for (const b of [...topButtons(), ...bottomButtons()]) {
      if (b.id === 'spin' ? Math.hypot(x - (b.x + 40), y - (b.y + 40)) < 40 : inside(b, x, y)) return b;
    }
    return null;
  }

  function activate(b) {
    if (!b || b.disabled) return;
    const id = b.id;
    if (id === 'mute') Sound.muted = !Sound.muted;
    else if (id === 'full') toggleFullscreen();
    else if (id === 'menu') showMenu();
    else if (id === 'info') { state.showInfo = true; Sound.click(); }
    else if (id === 'info-close') { state.showInfo = false; Sound.click(); }
    else if (id === 'refill') { state.gems += REFILL_GEMS; save(); Sound.fanfare(); }
    else if (id === 'bet-' || id === 'bet+') {
      state.betIndex = clamp(state.betIndex + (id === 'bet+' ? 1 : -1), 0, BETS.length - 1);
      save();
      Sound.click();
    } else if (id === 'auto') {
      state.auto = state.auto > 0 ? 0 : 10;
      Sound.click();
      if (state.auto && state.phase === 'idle') {
        state.auto--;
        spin();
      }
    } else if (id === 'spin') spin();
    else featureClick(id);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

  const overlay = document.getElementById('overlay');

  function showMenu() {
    if (!state) newState();
    state.mode = 'menu';
    state.auto = 0;
    overlay.innerHTML = `
      <div>
        <h2>Nameless Slots</h2>
        <p>Spin five reels of gems. Land orbs for free spins, chests for treasure, and fill the Gem Wheel for a shot at the jackpot.</p>
        <div class="row"><button type="button" class="primary" data-act="play">${state.spins ? 'Continue' : 'Play'}</button></div>
        <p class="help">You have ${fmt(state.gems)} gems. Space to spin · ↑ ↓ change bet · A auto spin · I pays</p>
        <p class="help">Play gems only: no real money, nothing to buy.</p>
      </div>`;
    overlay.classList.add('open');
  }

  function play() {
    state.mode = 'playing';
    overlay.classList.remove('open');
    overlay.innerHTML = '';
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    if (b.dataset.act === 'play') play();
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
    else if (state.phase === 'result') finishResult();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !state || state.mode !== 'playing') return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (state.showInfo) state.showInfo = false;
      else if (state.feature) {
        const btns = featureButtons().filter((b) => !b.id.startsWith('chest:') && !b.disabled);
        const f = state.feature;
        if (f.type === 'pick' && f.left > 0) {
          const closed = [...Array(9).keys()].filter((i) => !f.open.includes(i));
          featureClick(`chest:${closed[Math.floor(Math.random() * closed.length)]}`);
        } else if (btns.length && !(f.type === 'wheel' && f.spinning)) featureClick(btns[0].id);
      } else spin();
    } else if (k === 'arrowup') activate(bottomButtons()[1]);
    else if (k === 'arrowdown') activate(bottomButtons()[0]);
    else if (k === 'a') activate(bottomButtons()[2]);
    else if (k === 'i') state.showInfo = !state.showInfo;
    else if (k === 'm') Sound.muted = !Sound.muted;
    else if (k === 'f') toggleFullscreen();
    else return;
    e.preventDefault();
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
  };

  newState();
  showMenu();
  requestAnimationFrame(frame);
})();
