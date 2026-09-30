'use strict';

// Nameless Stand: hold the barricade through the night, prepare during the day.
// Everything, including the HUD and the day screens, is drawn on one canvas;
// there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 500;
  const BAR = 56; // HUD bar across the top
  const FIELD_TOP = 330; // zombies walk with their feet between these two lines
  const FIELD_BOT = 470;
  const PLAYER = { x: 84, y: 366 }; // feet, standing on the watchtower
  const LANTERN = { x: 132, y: 296 };
  const STREETLIGHT = { x: 672, y: 196 };
  const NIGHTS = 15;
  const DAY_HOURS = 12;
  const PLAYER_MAX = 100;
  const MAX_SURVIVORS = 4;
  const MAX_MINES = 8;
  const HEADSHOT = 2.5;
  const OUTLINE = '#0c0a09';

  // The barricade is a wall running into the screen at a slight angle, so its
  // face (towards the zombies) is visible.
  const WALL = { x: 238, lean: 30, height: 58 };

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const AIM_ERROR = Number(params.get('aim')) || 10; // autoplay aim wobble, in pixels
  const AIM_SLEW = Number(params.get('slew')) || 900; // autoplay mouse speed, in pixels per second

  // Weapons, in the order they are found while scavenging.
  const WEAPONS = [
    { name: 'Pistol', short: 'Pistol', kind: 'pistol', dmg: 24, rate: 0.2, auto: false, mag: 12, reload: 1.1,
      spread: 0.012, bloom: 0.012, pellets: 1, pierce: 1, find: 0, len: 16, snd: [1500, 0.16] },
    { name: 'Shotgun', short: 'Shotgun', kind: 'shotgun', dmg: 14, rate: 0.75, auto: false, mag: 6, reload: 2.0,
      spread: 0.1, bloom: 0, pellets: 8, pierce: 1, find: 18, len: 30, snd: [700, 0.3] },
    { name: 'SMG', short: 'SMG', kind: 'smg', dmg: 15, rate: 0.075, auto: true, mag: 32, reload: 1.6,
      spread: 0.03, bloom: 0.006, pellets: 1, pierce: 1, find: 90, len: 24, snd: [1900, 0.1] },
    { name: 'Hunting Rifle', short: 'Rifle', kind: 'rifle', dmg: 95, rate: 0.85, auto: false, mag: 5, reload: 1.9,
      spread: 0, bloom: 0, pellets: 1, pierce: 3, find: 16, len: 34, snd: [900, 0.28] },
    { name: 'Machine Gun', short: 'MG', kind: 'mg', dmg: 22, rate: 0.065, auto: true, mag: 100, reload: 3.6,
      spread: 0.045, bloom: 0.004, pellets: 1, pierce: 1, find: 140, len: 36, snd: [1200, 0.18] },
  ];

  // lean: how far the upper body tips forward; bulk: body width multiplier.
  const ZOMBIES = {
    walker: { hp: 70, speed: 34, dmg: 10, rate: 1.0, w: 18, h: 48, headR: 7.5, lean: -0.25, bulk: 1 },
    runner: { hp: 40, speed: 80, dmg: 6, rate: 0.7, w: 16, h: 44, headR: 7, lean: -0.5, bulk: 0.85 },
    crawler: { hp: 45, speed: 26, dmg: 8, rate: 0.9, w: 34, h: 16, headR: 6.5 },
    brute: { hp: 320, speed: 22, dmg: 30, rate: 1.4, w: 32, h: 64, headR: 9, lean: -0.2, bulk: 1.6 },
    riot: { hp: 90, helmet: 60, speed: 28, dmg: 12, rate: 1.0, w: 20, h: 50, headR: 7.5, lean: -0.12, bulk: 1.15 },
    spitter: { hp: 60, speed: 30, dmg: 18, rate: 3.0, w: 18, h: 46, headR: 7.5, lean: -0.2, bulk: 1 },
    exploder: { hp: 55, speed: 24, dmg: 90, rate: 1, w: 26, h: 46, headR: 7, lean: -0.05, bulk: 1.4 },
    screamer: { hp: 50, speed: 30, dmg: 6, rate: 0.8, w: 16, h: 52, headR: 7, lean: -0.3, bulk: 0.8 },
    boss: { hp: 2400, speed: 10, dmg: 80, rate: 1.6, w: 56, h: 104, headR: 14, lean: -0.35, bulk: 2.4 },
  };

  // Night-by-night mix: [type, first night, weight at that night, extra weight per night].
  const WAVE_MIX = [
    ['walker', 1, 10, 0],
    ['runner', 2, 3.2, 0.6],
    ['crawler', 3, 2.4, 0.3],
    ['brute', 4, 1, 0.15],
    ['riot', 5, 2.2, 0.25],
    ['spitter', 6, 1.3, 0.12],
    ['exploder', 7, 1.6, 0.12],
    ['screamer', 8, 1, 0.08],
  ];
  const BOSS_NIGHTS = [10, 15];

  // Base building.
  const TIERS = [
    { name: 'Wooden barricade', max: 500 },
    { name: 'Reinforced barricade', max: 850, cost: 40 },
    { name: 'Steel barricade', max: 1300, cost: 100 },
  ];
  const WIRE = [{ dps: 0 }, { dps: 5, cost: 20 }, { dps: 10, cost: 45 }, { dps: 16, cost: 80 }];
  const SPIKES = [{ dps: 0, slow: 0 }, { dps: 12, slow: 0.3, cost: 30 }, { dps: 24, slow: 0.45, cost: 70 }];
  const MINE = { cost: 8, radius: 70, dmg: 180 };

  // Scavenging runs.
  const LOCATIONS = [
    { id: 'hardware', name: 'Hardware store', risk: 0.04, riskLabel: 'Low risk', desc: 'Building materials.' },
    { id: 'police', name: 'Police station', risk: 0.13, riskLabel: 'High risk', desc: 'Guns and ammo.' },
    { id: 'hospital', name: 'Hospital', risk: 0.08, riskLabel: 'Some risk', desc: 'Medkits, a few materials.' },
    { id: 'market', name: 'Supermarket', risk: 0.05, riskLabel: 'Low risk', desc: 'A little of everything.' },
  ];

  const SHIRTS = ['#57534e', '#44403c', '#475569', '#7c2d12', '#365314', '#3f3f46', '#713f12', '#1e3a5f'];
  const PANTS = ['#1f2937', '#292524', '#3b3b4f', '#27303f', '#3f2e20'];
  const SKINS = ['#7d9a6a', '#8ea37a', '#6f8b61', '#94a38a', '#88977a'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const depth = (y) => 0.8 + 0.4 * ((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP));
  const wallX = (y) => WALL.x + WALL.lean / 2 - ((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP)) * WALL.lean;
  const tier = () => TIERS[state.build.tier];
  // Better barricades are also quicker to patch up.
  const repairPerHour = () => Math.round((30 + 12 * state.build.tier) * (1 + 0.25 * state.survivors.length));
  const article = (name) => (/^(SMG|[AEIOU])/.test(name) ? 'an' : 'a');

  // Small seeded random generator, so the scenery is the same every time.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem('nameless-stand-best')) || null;
    } catch {
      return null;
    }
  }

  function saveBest(run) {
    const best = loadBest();
    if (best && (best.night > run.night || (best.night === run.night && best.kills >= run.kills))) return;
    try {
      localStorage.setItem('nameless-stand-best', JSON.stringify(run));
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

    noise(dur, vol, freq, delay = 0) {
      const c = this.ctx;
      const t = c.currentTime + delay;
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

    gun(w) {
      this.play('gun', 0.03, () => {
        this.noise(w.snd[1], 0.35, w.snd[0]);
        this.tone(140, 0.08, 'sine', 0.2, 50);
      });
    },
    survivorShot() { this.play('sgun', 0.08, () => this.noise(0.1, 0.1, 1300)); },
    empty() { this.play('empty', 0.2, () => this.tone(1800, 0.03, 'square', 0.04)); },
    reload() {
      this.play('reload', 0.3, () => {
        this.noise(0.05, 0.15, 3000);
        this.noise(0.05, 0.15, 2500, 0.25);
      });
    },
    hit() { this.play('hit', 0.04, () => this.noise(0.06, 0.12, 700)); },
    headshot() { this.play('head', 0.05, () => this.tone(2400, 0.06, 'triangle', 0.06)); },
    clank() { this.play('clank', 0.05, () => { this.tone(1300, 0.12, 'square', 0.05, 900); this.noise(0.05, 0.1, 5000); }); },
    groan() {
      this.play('groan', 1.2, () => this.tone(rand(70, 110), rand(0.6, 1.1), 'sawtooth', 0.025, rand(50, 70)));
    },
    scream() { this.play('scream', 0.8, () => this.tone(900, 0.7, 'sawtooth', 0.05, 400)); },
    spit() { this.play('spit', 0.3, () => this.noise(0.15, 0.1, 900)); },
    splat() { this.play('splat', 0.15, () => this.noise(0.2, 0.15, 500)); },
    boom() { this.play('boom', 0.08, () => { this.noise(0.6, 0.45, 380); this.tone(90, 0.4, 'sine', 0.3, 35); }); },
    knock() { this.play('knock', 0.12, () => this.noise(0.12, 0.2, 400)); },
    hurt() { this.play('hurt', 0.3, () => this.tone(300, 0.2, 'square', 0.05, 120)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
    build() {
      this.play('build', 0.2, () => [0, 0.12, 0.24].forEach((d) => this.noise(0.06, 0.2, 1800, d)));
    },
    find() {
      this.play('find', 0.3, () => [660, 880].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, null, i * 0.1)));
    },
    dawn() {
      this.play('dawn', 1, () => [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.07, null, i * 0.15)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  // Pointer position (canvas coordinates) and trigger state.
  const input = { mx: 700, my: 380, down: false, over: false };

  function newGame() {
    state = {
      mode: 'playing', // 'menu' | 'playing' | 'paused' | 'over'
      phase: 'night', // 'night' | 'day' | 'results'
      night: 1,
      t: 0,
      barricade: TIERS[0].max,
      hp: PLAYER_MAX,
      res: { materials: 20, meds: 1 },
      build: { tier: 0, wire: 0, spikes: 0 },
      mines: [],
      guns: WEAPONS.map((w, i) => ({ owned: i === 0, mag: w.mag, reserve: i === 0 ? Infinity : 0 })),
      gun: 0,
      cd: 0,
      reloadT: 0,
      heat: 0,
      recoil: 0,
      flash: 0,
      survivors: [],
      pity: 0,
      bloodMoon: false,
      zombies: [],
      corpses: [],
      spawns: [],
      acid: [],
      tracers: [],
      parts: [],
      splats: [],
      scorches: [],
      lights: [],
      rings: [],
      texts: [],
      shake: 0,
      stats: { kills: 0, headshots: 0, shots: 0, hits: 0 },
      nightStats: null,
      plan: { repair: 4, scavenge: 6, search: 2, location: 'hardware' },
      results: [],
      introT: 0,
    };
    startNight();
  }

  // ---------------------------------------------------------------------------
  // Nights
  // ---------------------------------------------------------------------------

  function buildWave(n, blood) {
    const count = Math.round((14 + n * 7.2) * (blood ? 1.4 : 1));
    const weights = WAVE_MIX.map(([type, from, base, per]) => [type, n >= from ? base + per * (n - from) : 0]);
    const total = weights.reduce((s, [, w]) => s + w, 0);
    const duration = 40 + n * 3;
    const list = [];
    for (let k = 0; k < count; k++) {
      let r = Math.random() * total;
      let type = 'walker';
      for (const [name, w] of weights) {
        if (r < w) { type = name; break; }
        r -= w;
      }
      // Spawns come in loose clumps rather than an even drip.
      const t = (Math.floor(k / 4) / Math.ceil(count / 4)) * duration + rand(0, 6);
      list.push({ t, type });
    }
    if (BOSS_NIGHTS.includes(n)) list.push({ t: duration * 0.55, type: 'boss' });
    return list.sort((a, b) => a.t - b.t);
  }

  function startNight() {
    state.phase = 'night';
    state.t = 0;
    state.spawns = buildWave(state.night, state.bloodMoon);
    state.nightTotal = state.spawns.length;
    state.nightStats = { kills: 0, headshots: 0, barricade: state.barricade };
    state.introT = 3.5;
    for (const s of state.survivors) s.cd = rand(0.5, 1.5);
  }

  function spawnZombie(type) {
    const z = ZOMBIES[type];
    const scale = (1 + 0.09 * (state.night - 1)) * (type === 'boss' ? 1 + 0.06 * (state.night - 10) : 1);
    const y = type === 'boss' ? (FIELD_TOP + FIELD_BOT) / 2 + rand(-20, 20) : rand(FIELD_TOP, FIELD_BOT);
    state.zombies.push({
      type, y,
      x: W + rand(20, 60),
      hp: z.hp * scale,
      maxHp: z.hp * scale,
      helmet: z.helmet ? z.helmet * scale : 0,
      speed: z.speed * rand(0.85, 1.15) * (state.bloodMoon ? 1.12 : 1),
      cd: 0,
      flash: 0,
      walk: rand(0, 6),
      attack: 0,
      rage: 0,
      scream: rand(2, 4),
      spitX: rand(540, 660),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      skin: pick(SKINS),
      hair: Math.random() < 0.6,
      dead: false,
    });
    if (type === 'boss') {
      addText(W - 120, FIELD_TOP - 60, 'Something huge is here', '#fca5a5', 2.5);
      Sound.scream();
    } else if (Math.random() < 0.3) Sound.groan();
  }

  // Head position relative to the feet, in unscaled units, for upright zombies.
  function headLocal(t) {
    const k = t.h / 48;
    const hipY = -22 * k;
    const r = t.headR;
    const hx = -2 * k;
    const hy = -18 * k - r * 0.9;
    return {
      x: hx * Math.cos(t.lean) - hy * Math.sin(t.lean),
      y: hipY + hx * Math.sin(t.lean) + hy * Math.cos(t.lean),
      r,
    };
  }

  // Hitboxes in world coordinates; zombies further down the screen are closer and bigger.
  function geom(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    if (z.type === 'crawler') {
      return {
        s,
        body: [z.x - (t.w * s) / 2, z.y - t.h * s, z.x + (t.w * s) / 2, z.y],
        head: { x: z.x - (t.w * s) / 2 - 5 * s, y: z.y - 11 * s, r: t.headR * s },
      };
    }
    const h = headLocal(t);
    const head = { x: z.x + h.x * s, y: z.y + h.y * s, r: h.r * s };
    return {
      s,
      body: [Math.min(z.x - (t.w * s) / 2, head.x), head.y + head.r * 0.8, z.x + (t.w * s) / 2, z.y],
      head,
    };
  }

  function stopX(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    if (z.type === 'spitter' && state.barricade > 0) return Math.max(z.spitX, wallX(z.y) + 34 * s + (t.w * s) / 2);
    return state.barricade > 0 ? wallX(z.y) + 34 * s + (t.w * s) / 2 : PLAYER.x + 34 + (t.w * s) / 2;
  }

  function updateZombies(dt) {
    const spikes = SPIKES[state.build.spikes];
    const wire = WIRE[state.build.wire];
    for (const z of state.zombies) {
      if (z.dead) continue;
      const t = ZOMBIES[z.type];
      const s = depth(z.y);
      z.flash -= dt;
      z.cd -= dt;
      z.attack -= dt;
      z.rage = Math.max(0, z.rage - dt);
      let speed = z.speed * (z.rage > 0 ? 1.6 : 1);

      // Spike strip in front of the wall.
      const wx = wallX(z.y);
      if (spikes.dps && z.type !== 'crawler' && z.x > wx + 50 && z.x < wx + 125) {
        speed *= 1 - spikes.slow;
        hurtZombie(z, spikes.dps * dt, false, z.x, z.y, false, true);
        if (Math.random() < dt * 4) blood(z.x, z.y - 6, 1);
        if (z.dead) continue;
      }

      if (z.type === 'screamer') {
        z.scream -= dt;
        if (z.scream <= 0 && z.x < W - 40) {
          z.scream = 6;
          scream(z);
        }
      }

      const sx = stopX(z);
      if (z.x > sx) {
        z.x = Math.max(sx, z.x - speed * dt);
        z.walk += dt * speed * 0.12;
        z.moving = true;
        continue;
      }
      z.moving = false;

      // Clawing at the wall hurts on barbed wire.
      if (state.barricade > 0 && wire.dps && z.type !== 'spitter') {
        hurtZombie(z, wire.dps * dt, false, z.x, z.y, false, true);
        if (z.dead) continue;
      }
      if (z.cd > 0) continue;
      z.cd = t.rate * rand(0.9, 1.1);
      z.attack = 0.3;
      if (z.type === 'spitter') {
        spit(z);
      } else if (z.type === 'exploder') {
        // Reaching the wall sets it off.
        const hx = wallX(z.y);
        z.hp = 0;
        killZombie(z, false, z.x, z.y);
        damageDefences(t.dmg, hx, z.y);
      } else {
        damageDefences(t.dmg, wx + 24 * s, z.y - 26 * s);
      }
    }
    state.zombies = state.zombies.filter((z) => !z.dead);
  }

  // Damage the barricade, or the player once it is down.
  function damageDefences(dmg, x, y) {
    if (state.mode !== 'playing') return;
    if (state.barricade > 0) {
      state.barricade = Math.max(0, state.barricade - dmg);
      burst(x, y, '#a16207', 4, 80);
      Sound.knock();
      if (state.barricade === 0) {
        addText(WALL.x, FIELD_TOP - 50, 'The barricade is down!', '#f87171', 2);
        state.shake = 8;
        burst(WALL.x, FIELD_TOP + 40, '#78350f', 30, 200);
      }
    } else {
      state.hp = Math.max(0, state.hp - dmg * 0.5);
      state.shake = Math.max(state.shake, 5);
      Sound.hurt();
      if (state.hp <= 0) finish(false);
    }
  }

  function scream(z) {
    const s = depth(z.y);
    state.rings.push({ x: z.x, y: z.y - 40 * s, r: 10, life: 0.8, max: 0.8 });
    for (const o of state.zombies) {
      if (o !== z && Math.hypot(o.x - z.x, (o.y - z.y) * 1.5) < 220) o.rage = 4;
    }
    Sound.scream();
  }

  function spit(z) {
    const g = geom(z);
    const ty = rand(FIELD_TOP, FIELD_BOT);
    const down = state.barricade <= 0;
    const tx = down ? PLAYER.x + 10 : wallX(ty) + 6;
    const tyy = down ? PLAYER.y - 30 : ty - 30 * depth(ty);
    const T = 1.1;
    const gAcc = 500;
    state.acid.push({
      x: g.head.x, y: g.head.y,
      vx: (tx - g.head.x) / T,
      vy: (tyy - g.head.y - 0.5 * gAcc * T * T) / T,
      g: gAcc, t: 0, T, dmg: ZOMBIES.spitter.dmg * (1 + 0.05 * state.night),
    });
    Sound.spit();
  }

  function updateAcid(dt) {
    for (const a of state.acid) {
      a.t += dt;
      a.vy += a.g * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (Math.random() < 0.5) state.parts.push({ x: a.x, y: a.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#84cc16', size: 3, floor: H });
      if (a.t >= a.T) {
        a.done = true;
        burst(a.x, a.y, '#a3e635', 12, 120);
        Sound.splat();
        damageDefences(a.dmg, a.x, a.y);
      }
    }
    state.acid = state.acid.filter((a) => !a.done);
  }

  function updateMines() {
    for (const m of state.mines) {
      for (const z of state.zombies) {
        if (z.dead) continue;
        if (Math.abs(z.x - m.x) < 16 && Math.abs(z.y - m.y) < 12) {
          m.done = true;
          explode(m.x, m.y, MINE.radius, MINE.dmg);
          break;
        }
      }
    }
    state.mines = state.mines.filter((m) => !m.done);
  }

  function explode(x, y, radius, dmg) {
    state.scorches.push({ x, y, r: radius * 0.6 });
    if (state.scorches.length > 30) state.scorches.shift();
    state.lights.push({ x, y: y - 20, r: radius * 4, life: 0.35, max: 0.35 });
    for (let k = 0; k < 26; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(60, 320);
      state.parts.push({
        x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 120,
        life: rand(0.3, 0.7), max: 0.7, color: pick(['#fbbf24', '#f97316', '#ef4444', '#fde68a']), size: rand(3, 6), floor: y + 10,
      });
    }
    for (let k = 0; k < 10; k++) {
      state.parts.push({
        x: x + rand(-20, 20), y: y - rand(5, 30), vx: rand(-20, 20), vy: rand(-60, -20),
        life: rand(0.8, 1.4), max: 1.4, color: 'rgba(68,64,60,0.7)', size: rand(10, 22), floor: H, smoke: true,
      });
    }
    state.shake = Math.max(state.shake, 9);
    Sound.boom();
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - x, (z.y - y) * 1.6);
      if (d < radius) hurtZombie(z, dmg * (1 - (0.5 * d) / radius), false, z.x, z.y - 20 * depth(z.y), false);
    }
  }

  function hurtZombie(z, dmg, head, hx, hy, fromPlayer, quiet) {
    if (z.dead) return;
    z.hp -= dmg;
    if (!quiet) {
      z.flash = 0.08;
      if (z.type !== 'brute' && z.type !== 'boss') z.x += Math.min(6, dmg * 0.08);
      blood(hx, hy, head ? 8 : 4);
      if (fromPlayer) {
        if (head) Sound.headshot();
        else Sound.hit();
      }
    }
    if (z.hp <= 0) killZombie(z, head, hx, hy, fromPlayer);
  }

  function killZombie(z, head, hx, hy, fromPlayer) {
    if (z.dead) return;
    z.dead = true;
    state.stats.kills++;
    state.nightStats.kills++;
    if (head) {
      state.stats.headshots++;
      state.nightStats.headshots++;
      if (fromPlayer) addText(hx, hy - 12, 'HEADSHOT', '#fde047', 0.8);
      blood(hx, hy, 16);
    }
    const s = depth(z.y);
    blood(z.x, z.y - 20 * s, 10);
    state.splats.push({ x: z.x + rand(-6, 6), y: z.y + rand(-2, 2), r: rand(8, 16) * s * (z.type === 'boss' ? 3 : 1) });
    if (state.splats.length > 160) state.splats.shift();
    if (z.type === 'exploder') {
      explode(z.x, z.y, 80, 130);
      return;
    }
    state.corpses.push({ z, t: 0 });
    if (state.corpses.length > 45) state.corpses.shift();
    if (z.type === 'boss') {
      state.shake = 12;
      addText(z.x, z.y - 140, 'The giant falls', '#fde047', 2);
    }
  }

  // --- Shooting --------------------------------------------------------------

  function rayCircle(ox, oy, dx, dy, c) {
    const fx = ox - c.x;
    const fy = oy - c.y;
    const b = fx * dx + fy * dy;
    const disc = b * b - (fx * fx + fy * fy - c.r * c.r);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : null;
  }

  function rayRect(ox, oy, dx, dy, [x0, y0, x1, y1]) {
    let tmin = 0;
    let tmax = Infinity;
    for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oy, dy, y0, y1]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) return null;
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  // Everything a ray passes through, nearest first.
  function rayHits(ox, oy, ang) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const hits = [];
    for (const z of state.zombies) {
      if (z.dead) continue;
      const g = geom(z);
      const th = rayCircle(ox, oy, dx, dy, g.head);
      const tb = rayRect(ox, oy, dx, dy, g.body);
      if (th === null && tb === null) continue;
      const head = th !== null && (tb === null || th <= tb + 2);
      const t = head ? th : tb;
      hits.push({ z, t, head, x: ox + dx * t, y: oy + dy * t });
    }
    return hits.sort((a, b) => a.t - b.t);
  }

  const SHOULDER = { x: PLAYER.x + 3, y: PLAYER.y - 38 };

  function aimAngle() {
    return clamp(Math.atan2(input.my - SHOULDER.y, Math.max(20, input.mx - SHOULDER.x)), -1.1, 1.1);
  }

  function muzzle() {
    const ang = aimAngle();
    const w = WEAPONS[state.gun];
    const len = 8 + w.len;
    return { x: SHOULDER.x + Math.cos(ang) * len, y: SHOULDER.y + Math.sin(ang) * len, ang };
  }

  function tryFire() {
    if (state.phase !== 'night' || state.mode !== 'playing') return;
    const g = state.guns[state.gun];
    const w = WEAPONS[state.gun];
    if (state.reloadT > 0 || state.cd > 0) return;
    if (g.mag <= 0) {
      if (g.reserve > 0) startReload();
      else Sound.empty();
      return;
    }
    g.mag--;
    state.cd = w.rate;
    state.stats.shots++;
    const m = muzzle();
    const spread = w.spread + state.heat;
    let anyHit = false;
    for (let p = 0; p < w.pellets; p++) {
      const ang = m.ang + rand(-spread, spread);
      const hits = rayHits(m.x, m.y, ang);
      let dmg = w.dmg;
      let end = null;
      for (const h of hits.slice(0, w.pierce)) {
        anyHit = true;
        end = h;
        if (h.head && h.z.helmet > 0) {
          // Helmets soak up headshots until they come off.
          h.z.helmet -= dmg;
          h.z.flash = 0.06;
          burst(h.x, h.y, '#e5e7eb', 6, 140);
          Sound.clank();
          if (h.z.helmet <= 0) {
            addText(h.x, h.y - 14, 'Helmet off', '#e5e7eb', 0.8);
            burst(h.x, h.y, '#1e3a8a', 10, 180);
          }
          break;
        }
        hurtZombie(h.z, dmg * (h.head ? HEADSHOT : 1), h.head, h.x, h.y, true);
        dmg *= 0.8;
      }
      const far = end ? end.t : 1400;
      state.tracers.push({
        x0: m.x, y0: m.y, x1: m.x + Math.cos(ang) * far, y1: m.y + Math.sin(ang) * far,
        life: 0.06, color: 'rgba(253, 230, 138, 0.9)', width: w.pellets > 1 ? 1 : 2,
      });
    }
    if (anyHit) state.stats.hits++;
    state.heat = Math.min(0.12, state.heat + w.bloom);
    state.recoil = Math.min(1, state.recoil + (w.pellets > 1 || w.pierce > 1 ? 1 : 0.35));
    state.flash = 0.05;
    state.lights.push({ x: m.x, y: m.y, r: 340, life: 0.06, max: 0.06 });
    state.shake = Math.max(state.shake, w.pellets > 1 || w.pierce > 1 ? 3 : 1);
    // Spent casing.
    state.parts.push({
      x: SHOULDER.x + 8, y: SHOULDER.y, vx: rand(-80, -30), vy: rand(-160, -90),
      life: 0.8, max: 0.8, color: '#d4a017', size: 2.5, floor: PLAYER.y + 2,
    });
    Sound.gun(w);
    if (g.mag === 0 && g.reserve > 0) startReload();
  }

  function startReload() {
    const g = state.guns[state.gun];
    const w = WEAPONS[state.gun];
    if (state.reloadT > 0 || g.mag >= w.mag || g.reserve <= 0) return;
    state.reloadT = w.reload;
    Sound.reload();
  }

  function finishReload() {
    const g = state.guns[state.gun];
    const w = WEAPONS[state.gun];
    const take = Math.min(w.mag - g.mag, g.reserve);
    g.mag += take;
    if (g.reserve !== Infinity) g.reserve -= take;
  }

  function switchGun(i) {
    if (!state.guns[i] || !state.guns[i].owned || i === state.gun) return;
    state.gun = i;
    state.reloadT = 0;
    state.cd = Math.max(state.cd, 0.25);
    Sound.click();
  }

  function cycleGun(dir) {
    const owned = state.guns.map((g, i) => (g.owned ? i : -1)).filter((i) => i >= 0);
    const k = owned.indexOf(state.gun);
    switchGun(owned[(k + dir + owned.length) % owned.length]);
  }

  function updateSurvivors(dt) {
    for (const s of state.survivors) {
      s.cd -= dt;
      s.flash -= dt;
      if (s.cd > 0) continue;
      const target = state.zombies.filter((z) => !z.dead && z.x < W - 10).sort((a, b) => a.x - b.x)[0];
      if (!target) continue;
      s.cd = rand(1.2, 1.8);
      s.flash = 0.05;
      const g = geom(target);
      const ox = s.x + 20;
      const oy = s.y - 36;
      const aimHead = Math.random() < 0.2 && !(target.helmet > 0);
      const tx = aimHead ? g.head.x : target.x;
      const ty = aimHead ? g.head.y : (g.body[1] + g.body[3]) / 2;
      s.aim = Math.atan2(ty - oy, tx - ox);
      state.lights.push({ x: ox, y: oy, r: 160, life: 0.05, max: 0.05 });
      Sound.survivorShot();
      if (Math.random() < 0.6) {
        hurtZombie(target, 12 * (aimHead ? HEADSHOT : 1) * (1 + 0.04 * state.night), aimHead, tx, ty, false);
        state.tracers.push({ x0: ox, y0: oy, x1: tx, y1: ty, life: 0.05, color: 'rgba(253,230,138,0.6)', width: 1 });
      } else {
        state.tracers.push({ x0: ox, y0: oy, x1: tx + rand(-30, 30), y1: ty - rand(20, 60), life: 0.05, color: 'rgba(253,230,138,0.4)', width: 1 });
      }
    }
  }

  function step(dt) {
    state.t += dt;
    if (state.phase !== 'night') return;

    while (state.spawns.length && state.spawns[0].t <= state.t) spawnZombie(state.spawns.shift().type);

    const g = state.guns[state.gun];
    state.cd -= dt;
    state.heat = Math.max(0, state.heat - dt * 0.12);
    state.recoil = Math.max(0, state.recoil - dt * 6);
    state.flash -= dt;
    if (state.reloadT > 0) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) {
        state.reloadT = 0;
        finishReload();
      }
    }
    if (AUTOPLAY) autoAim(dt);
    if (input.down && WEAPONS[state.gun].auto) tryFire();
    if (g.mag === 0 && g.reserve === 0 && !AUTOPLAY && state.cd <= -0.4) switchGun(0);

    updateSurvivors(dt);
    updateMines();
    updateZombies(dt);
    updateAcid(dt);
    if (Math.random() < dt * 0.15 * Math.min(4, state.zombies.length)) Sound.groan();

    if (state.mode === 'playing' && !state.spawns.length && !state.zombies.length && !state.acid.length) endNight();
  }

  // ---------------------------------------------------------------------------
  // Days
  // ---------------------------------------------------------------------------

  function endNight() {
    const n = state.nightStats;
    const lost = n.barricade - state.barricade;
    state.results = [
      { text: `Night ${state.night} survived.`, tone: 'good' },
      { text: `${n.kills} zombies killed, ${n.headshots} with headshots.` },
      { text: lost > 0 ? `The barricade took ${lost} damage.` : 'The barricade held without a scratch.' },
    ];
    Sound.dawn();
    if (state.night >= NIGHTS) {
      finish(true);
      return;
    }
    state.night++;
    state.phase = 'day';
    state.bloodMoon = false;
    state.hp = Math.min(PLAYER_MAX, state.hp + 15);
    state.plan = defaultPlan();
    state.splats = state.splats.slice(-40);
    state.corpses = [];
    state.scorches = state.scorches.slice(-8);
    if (AUTOPLAY) {
      autoBuild();
      spendDay();
    }
  }

  function defaultPlan() {
    const need = Math.ceil((tier().max - state.barricade) / repairPerHour());
    const repair = clamp(need, 0, 10);
    const rest = DAY_HOURS - repair;
    const search = state.survivors.length < MAX_SURVIVORS ? Math.floor(rest / 3) : 0;
    let location = state.plan ? state.plan.location : 'hardware';
    if (AUTOPLAY) {
      const missingGun = state.guns.some((g) => !g.owned);
      if (state.hp < 55 && state.res.meds === 0) location = 'hospital';
      else if (missingGun && state.hp >= 55 && state.night % 2 === 0) location = 'police';
      else if (state.night % 3 === 0) location = 'police';
      else location = 'hardware';
    }
    return { repair, scavenge: rest - search, search, location };
  }

  // One scavenging run: loot per hour, injuries, and at most one event.
  function runScavenge(loc, hours, lines) {
    const place = LOCATIONS.find((l) => l.id === loc);
    let mats = 0;
    let meds = 0;
    let hurt = 0;
    const ammo = {};
    const ownedGuns = () => state.guns.map((g, i) => i).filter((i) => i > 0 && state.guns[i].owned);
    const addAmmo = (share) => {
      const owned = ownedGuns();
      if (!owned.length) return false;
      const i = pick(owned);
      const amount = Math.ceil(WEAPONS[i].find * share);
      state.guns[i].reserve += amount;
      ammo[i] = (ammo[i] || 0) + amount;
      return true;
    };
    const findGun = (chance) => {
      const next = state.guns.findIndex((g) => !g.owned);
      if (next < 0 || Math.random() >= chance + state.pity) {
        if (next >= 0) state.pity += loc === 'police' ? 0.035 : 0.01;
        return false;
      }
      state.guns[next].owned = true;
      state.guns[next].mag = WEAPONS[next].mag;
      state.guns[next].reserve = WEAPONS[next].find;
      state.pity = 0;
      lines.push({ text: `Found ${article(WEAPONS[next].name)} ${WEAPONS[next].name}!`, tone: 'good', big: true });
      Sound.find();
      return true;
    };

    for (let h = 0; h < hours; h++) {
      if (loc === 'hardware') {
        mats += randInt(6, 10);
      } else if (loc === 'police') {
        if (!findGun(0.1) && (Math.random() >= 0.85 || !addAmmo(0.5))) mats += 2;
      } else if (loc === 'hospital') {
        if (Math.random() < 0.35) meds++;
        else mats += 3;
      } else {
        mats += 3;
        if (Math.random() < 0.4) addAmmo(0.25);
        if (Math.random() < 0.12) meds++;
        findGun(0.04);
      }
      if (Math.random() < place.risk) hurt += randInt(8, 18);
    }

    // Random event.
    if (hours >= 2 && Math.random() < 0.3) {
      const events = [
        () => {
          const bonus = randInt(12, 20);
          mats += bonus;
          lines.push({ text: `You found a stash of lumber and scrap (+${bonus} materials).`, tone: 'good' });
        },
        () => {
          if (!addAmmo(0.8)) return;
          lines.push({ text: 'A crashed patrol car still had ammo in the trunk.', tone: 'good' });
        },
        () => {
          if (state.survivors.length >= MAX_SURVIVORS) return;
          addSurvivor();
          lines.push({ text: 'A stranded survivor asked to join you.', tone: 'good', big: true });
        },
      ];
      if (loc === 'police' || loc === 'hospital') {
        events.push(() => {
          const dmg = randInt(15, 25);
          hurt += dmg;
          lines.push({ text: `Ambushed inside the ${place.name.toLowerCase()} (-${dmg} health).`, tone: 'bad' });
        });
      }
      if (loc === 'hospital' || loc === 'market') {
        events.push(() => {
          meds++;
          lines.push({ text: 'You found a sealed first-aid cabinet (+1 medkit).', tone: 'good' });
        });
      }
      pick(events)();
    }

    state.res.materials += mats;
    state.res.meds += meds;
    const found = [];
    if (mats) found.push(`${mats} materials`);
    if (meds) found.push(`${meds} medkit${meds > 1 ? 's' : ''}`);
    for (const [i, amount] of Object.entries(ammo)) found.push(`${amount} ${WEAPONS[i].short} ammo`);
    lines.push({ text: found.length ? `${place.name}: ${found.join(', ')}.` : `${place.name}: nothing useful.` });
    if (hurt) {
      state.hp = Math.max(1, state.hp - hurt);
      lines.push({ text: `You were hurt while scavenging (-${hurt} health).`, tone: 'bad' });
    }
  }

  function spendDay() {
    const p = state.plan;
    const lines = [];
    if (p.repair) {
      const before = state.barricade;
      state.barricade = Math.min(tier().max, state.barricade + p.repair * repairPerHour());
      lines.push({ text: `Repairs restored ${state.barricade - before} barricade (${state.barricade}/${tier().max}).` });
    }
    if (p.scavenge) runScavenge(p.location, p.scavenge, lines);
    let joined = 0;
    for (let h = 0; h < p.search && state.survivors.length < MAX_SURVIVORS; h++) {
      if (Math.random() < 0.1) {
        addSurvivor();
        joined++;
      }
    }
    if (joined) {
      lines.push({ text: `${joined} survivor${joined > 1 ? 's' : ''} joined you.`, tone: 'good', big: true });
      Sound.find();
    } else if (p.search) lines.push({ text: 'No survivors found today.' });

    // Warnings about the coming night.
    if (BOSS_NIGHTS.includes(state.night)) {
      lines.push({ text: 'The ground shakes in the distance. Something huge is coming tonight.', tone: 'warn', big: true });
    } else if (state.night >= 6 && Math.random() < 0.22) {
      state.bloodMoon = true;
      lines.push({ text: 'The moon is turning red. Tonight will be worse.', tone: 'warn', big: true });
    }
    state.results = lines;
    state.phase = 'results';
    if (AUTOPLAY) {
      autoBuild();
      startNight();
    }
  }

  function addSurvivor() {
    const k = state.survivors.length;
    state.survivors.push({
      x: 150 + (k % 2) * 34,
      y: FIELD_TOP + 26 + k * 30,
      cd: 1,
      flash: 0,
      aim: 0,
      jacket: pick(['#1d4ed8', '#0f766e', '#a16207', '#9d174d', '#4d7c0f']),
      pants: pick(PANTS),
      hat: pick(['cap', 'none', 'band']),
    });
  }

  // --- Building ----------------------------------------------------------------

  function buildRows() {
    const b = state.build;
    const next = TIERS[b.tier + 1];
    const m = state.res.materials;
    return [
      {
        id: 'tier',
        name: next ? `Upgrade to ${next.name.toLowerCase()}` : TIERS[b.tier].name,
        desc: next ? `Max health ${tier().max} → ${next.max}` : `Max health ${tier().max} (best)`,
        cost: next ? next.cost : null,
        ok: next && m >= next.cost,
      },
      {
        id: 'wire',
        name: b.wire ? `Barbed wire (level ${b.wire})` : 'Barbed wire',
        desc: b.wire === 0 ? `Zombies at the wall take ${WIRE[1].dps} damage/s`
          : b.wire < 3 ? `Damage at the wall ${WIRE[b.wire].dps}/s → ${WIRE[b.wire + 1].dps}/s` : `${WIRE[b.wire].dps} damage/s (max)`,
        cost: b.wire < 3 ? WIRE[b.wire + 1].cost : null,
        ok: b.wire < 3 && m >= WIRE[b.wire + 1].cost,
      },
      {
        id: 'spikes',
        name: b.spikes ? `Spike strip (level ${b.spikes})` : 'Spike strip',
        desc: b.spikes === 0 ? `Slows zombies by ${SPIKES[1].slow * 100}% and cuts for ${SPIKES[1].dps}/s`
          : b.spikes < 2 ? `Slow ${SPIKES[1].slow * 100}% → ${SPIKES[2].slow * 100}%, cuts ${SPIKES[1].dps}/s → ${SPIKES[2].dps}/s`
            : `Slows ${SPIKES[2].slow * 100}% and cuts ${SPIKES[2].dps}/s (max)`,
        cost: b.spikes < 2 ? SPIKES[b.spikes + 1].cost : null,
        ok: b.spikes < 2 && m >= SPIKES[b.spikes + 1].cost,
      },
      {
        id: 'mine',
        name: `Landmine (${state.mines.length}/${MAX_MINES} placed)`,
        desc: 'Explodes when a zombie steps on it',
        cost: state.mines.length < MAX_MINES ? MINE.cost : null,
        ok: state.mines.length < MAX_MINES && m >= MINE.cost,
      },
      {
        id: 'medkit',
        name: `Medkit (you have ${state.res.meds})`,
        desc: 'Heals 50 health',
        cost: 'use',
        ok: state.res.meds > 0 && state.hp < PLAYER_MAX,
      },
    ];
  }

  function doBuild(id) {
    const row = buildRows().find((r) => r.id === id);
    if (!row || !row.ok) {
      Sound.deny();
      return false;
    }
    const b = state.build;
    if (id === 'medkit') {
      state.res.meds--;
      state.hp = Math.min(PLAYER_MAX, state.hp + 50);
      Sound.find();
      return true;
    }
    state.res.materials -= row.cost;
    if (id === 'tier') {
      b.tier++;
      state.barricade += tier().max - TIERS[b.tier - 1].max;
    } else if (id === 'wire') b.wire++;
    else if (id === 'spikes') b.spikes++;
    else if (id === 'mine') {
      state.mines.push({ x: rand(WALL.x + 130, 760), y: rand(FIELD_TOP + 6, FIELD_BOT - 6), blink: rand(0, 1) });
    }
    Sound.build();
    return true;
  }

  // Autoplay: sensible spending in a fixed priority order.
  function autoBuild() {
    if (state.hp < 60 && state.res.meds > 0) doBuild('medkit');
    const order = ['tier', 'wire', 'spikes', 'mine', 'mine', 'wire', 'spikes', 'tier', 'mine', 'mine', 'wire', 'mine', 'mine', 'mine', 'mine'];
    for (const id of order) {
      const row = buildRows().find((r) => r.id === id);
      if (row.ok) doBuild(id);
      else if (row.cost !== null) break;
    }
  }

  function finish(won) {
    state.mode = 'over';
    state.won = won;
    input.down = false;
    const run = { night: won ? NIGHTS : state.night, kills: state.stats.kills, won };
    state.prevBest = loadBest();
    saveBest(run);
    if (won) Sound.dawn();
    else Sound.lose();
    showOverlay('over');
  }

  // Autoplay: a rough stand-in for a human. It picks a target (spitters and
  // nearby exploders first, otherwise the zombie closest to the wall), reacts
  // after a short delay, moves the mouse at a limited speed with some wobble,
  // and only fires once the crosshair is roughly on target.
  const bot = { target: null, react: 0, ox: 0, oy: 0 };

  function botPriority(z) {
    let score = z.x;
    if (z.type === 'spitter' && !z.moving) score -= 350;
    if (z.type === 'exploder' && z.x < wallX(z.y) + 220) score -= 250;
    if (z.type === 'screamer') score -= 120;
    return score;
  }

  function autoAim(dt) {
    // Save the big guns for when zombies are close or numerous.
    const owned = state.guns.map((g, i) => i).filter((i) => state.guns[i].owned && state.guns[i].mag + state.guns[i].reserve > 0);
    const nearest = Math.min(...state.zombies.map((z) => z.x), W);
    const danger = nearest < 480 || state.zombies.length > 10 || state.zombies.some((z) => z.type === 'boss');
    const want = danger ? owned[owned.length - 1] : 0;
    if (want !== state.gun && state.reloadT <= 0) switchGun(want);
    if (!bot.target || bot.target.dead || !state.zombies.includes(bot.target)) {
      bot.target = state.zombies.filter((z) => !z.dead && z.x < W - 20).sort((a, b) => botPriority(a) - botPriority(b))[0] || null;
      bot.react = rand(0.2, 0.35);
      bot.ox = rand(-AIM_ERROR, AIM_ERROR);
      bot.oy = rand(-AIM_ERROR, AIM_ERROR) + AIM_ERROR * 0.5;
    }
    input.down = false;
    if (!bot.target) return;
    bot.react -= dt;
    if (bot.react > 0) return;
    const g = geom(bot.target);
    // Shoot helmets in the body.
    const aimBody = bot.target.helmet > 0;
    const tx = (aimBody ? bot.target.x : g.head.x) + bot.ox;
    const ty = (aimBody ? (g.body[1] + g.body[3]) / 2 : g.head.y) + bot.oy;
    const dx = tx - input.mx;
    const dy = ty - input.my;
    const dist = Math.hypot(dx, dy);
    const stepLen = AIM_SLEW * dt;
    if (dist > stepLen) {
      input.mx += (dx / dist) * stepLen;
      input.my += (dy / dist) * stepLen;
    } else {
      input.mx = tx;
      input.my = ty;
    }
    if (dist < 12) {
      input.down = true;
      tryFire();
      bot.ox = clamp(bot.ox + rand(-3, 3), -AIM_ERROR, AIM_ERROR);
      bot.oy = clamp(bot.oy + rand(-3, 3), -AIM_ERROR, AIM_ERROR * 1.5);
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n, power) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.3, 1) * power;
      state.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3,
        life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 4), floor: y + 30,
      });
    }
  }

  function blood(x, y, n) {
    burst(x, y, pick(['#7f1d1d', '#991b1b', '#450a0a']), n, 120);
  }

  function addText(x, y, text, color, life = 0.8) {
    state.texts.push({ x, y, text: String(text), color, life, max: life });
  }

  function updateEffects(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      if (p.smoke) {
        p.size += dt * 14;
      } else {
        p.vy += 600 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor) { p.y = p.floor; p.vy *= -0.25; p.vx *= 0.5; }
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    if (state.parts.length > 800) state.parts.splice(0, state.parts.length - 800);
    for (const t of state.tracers) t.life -= dt;
    state.tracers = state.tracers.filter((t) => t.life > 0);
    for (const l of state.lights) l.life -= dt;
    state.lights = state.lights.filter((l) => l.life > 0);
    for (const r of state.rings) {
      r.life -= dt;
      r.r += dt * 260;
    }
    state.rings = state.rings.filter((r) => r.life > 0);
    for (const c of state.corpses) c.t += dt;
    state.corpses = state.corpses.filter((c) => c.t < 8);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 25 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    state.shake = Math.max(0, state.shake - dt * 25);
    for (const s of state.survivors) s.flash -= dt;
    state.introT -= dt;
  }

  // ---------------------------------------------------------------------------
  // Screen layout (all hit-tested in canvas coordinates)
  // ---------------------------------------------------------------------------

  const SYS = { x0: 868, y: 10, size: 36, gap: 6 };
  const PANEL = { x: 40, y: 68, w: 920, h: 418 };
  const LX = PANEL.x + 26;
  const RX = PANEL.x + 470;
  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  function gunSlots() {
    return WEAPONS.map((w, i) => ({ id: `gun${i}`, i, x: 452 + i * 80, y: 8, w: 74, h: 40 }));
  }

  const PLAN_ROWS = [
    { key: 'repair', y: PANEL.y + 74 },
    { key: 'scavenge', y: PANEL.y + 134 },
    { key: 'search', y: PANEL.y + 250 },
  ];

  function dayButtons() {
    const btns = [];
    for (const row of PLAN_ROWS) {
      btns.push({ id: `minus:${row.key}`, x: LX + 318, y: row.y, w: 32, h: 32, label: '−' });
      btns.push({ id: `plus:${row.key}`, x: LX + 392, y: row.y, w: 32, h: 32, label: '+' });
    }
    LOCATIONS.forEach((l, k) => {
      btns.push({ id: `loc:${l.id}`, x: LX + k * 106, y: PANEL.y + 178, w: 100, h: 46, loc: l });
    });
    return btns;
  }

  function buildButtons() {
    return buildRows().map((row, k) => ({
      id: `build:${row.id}`, row,
      x: RX + 300, y: PANEL.y + 78 + k * 54, w: 124, h: 34,
    }));
  }

  function primaryButton() {
    return {
      id: state.phase === 'day' ? 'spend' : 'night',
      label: state.phase === 'day' ? 'Spend the day' : `Face night ${state.night}`,
      x: PANEL.x + PANEL.w / 2 - 120, y: PANEL.y + PANEL.h - 52, w: 240, h: 40,
    };
  }

  function screenButtons() {
    if (!state || state.mode !== 'playing') return [];
    if (state.phase === 'day') return [...dayButtons(), ...buildButtons(), primaryButton()];
    if (state.phase === 'results') return [...buildButtons(), primaryButton()];
    return [];
  }

  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (state.mode === 'menu') return null;
    for (const b of screenButtons()) if (inside(b, x, y)) return b;
    for (const s of gunSlots()) if (state.guns[s.i].owned && inside(s, x, y)) return s;
    return null;
  }

  function planUsed() {
    const p = state.plan;
    return p.repair + p.scavenge + p.search;
  }

  function activate(id) {
    if (id === 'pause') { togglePause(); return; }
    if (id === 'mute') { Sound.muted = !Sound.muted; return; }
    if (id === 'full') { toggleFullscreen(); return; }
    if (!state || state.mode !== 'playing') return;
    if (id.startsWith('gun')) { switchGun(Number(id.slice(3))); return; }
    const [op, key] = id.split(':');
    if (op === 'plus') {
      if (planUsed() >= DAY_HOURS || (key === 'search' && state.survivors.length >= MAX_SURVIVORS)) {
        Sound.deny();
        return;
      }
      state.plan[key]++;
      Sound.click();
    } else if (op === 'minus') {
      if (state.plan[key] <= 0) return;
      state.plan[key]--;
      Sound.click();
    } else if (op === 'loc') {
      state.plan.location = key;
      Sound.click();
    } else if (op === 'build') {
      doBuild(key);
    } else if (id === 'spend') {
      Sound.click();
      spendDay();
    } else if (id === 'night') {
      Sound.click();
      startNight();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Offscreen layers: the static scenery, and the night-time darkness mask.
  const bg = document.createElement('canvas');
  const bgCtx = bg.getContext('2d');
  let bgKey = '';
  const dark = document.createElement('canvas');
  dark.width = W / 2;
  dark.height = H / 2;
  const darkCtx = dark.getContext('2d');
  let glows = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
    bgKey = '';
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }

  function outlined(text, x, y, font, color) {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // A thick rounded limb with a dark outline, through a list of points.
  function limb(points, width, color) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + 2.4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function fillOutline(color, width = 1.4) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = width;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(c * amount), 0, 255);
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  }

  function render() {
    const s = canvas.width / W;
    const night = !state || state.phase === 'night';
    const blood = !!(state && state.bloodMoon && night);
    ensureBackground(night, blood, s);
    const shake = state && state.shake > 0 ? state.shake : 0;
    const ox = rand(-shake, shake);
    const oy = rand(-shake, shake);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.drawImage(bg, ox * s, oy * s);
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    glows = [];
    if (state) drawWorld(night);
    if (state && night) drawDarkness(blood);
    ctx.restore();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) return;
    drawHud();
    if (state.mode === 'playing' || state.mode === 'paused') {
      if (state.phase === 'day' || state.phase === 'results') drawDayPanel();
      else if (state.introT > 0) drawIntro();
    }
    drawCursor();
  }

  function drawWorld(night) {
    // Ground decals.
    for (const sc of state.scorches) {
      const g = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
      g.addColorStop(0, 'rgba(10,8,6,0.75)');
      g.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, sc.r, sc.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sp of state.splats) {
      ctx.fillStyle = 'rgba(69, 10, 10, 0.6)';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sp.x + sp.r * 0.8, sp.y + 1, sp.r * 0.3, sp.r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSpikes();
    for (const m of state.mines) drawMine(m, night);
    drawWall();
    drawWire();
    for (const c of state.corpses) drawCorpse(c);

    const actors = [
      ...state.zombies.map((z) => ({ y: z.y, draw: () => drawZombie(z, night) })),
      ...state.survivors.map((sv) => ({ y: sv.y, draw: () => drawSurvivor(sv) })),
      { y: 452, draw: drawTower },
    ].sort((a, b) => a.y - b.y);
    actors.forEach((a) => a.draw());

    for (const a of state.acid) {
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
      glows.push({ x: a.x, y: a.y, r: 12, color: 'rgba(163,230,53,0.5)' });
    }
    for (const r of state.rings) {
      ctx.strokeStyle = `rgba(254, 202, 202, ${r.life / r.max})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const t of state.tracers) {
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    for (const p of state.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.smoke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      ctx.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
      outlined(t.text, t.x, t.y, 'bold 13px system-ui, sans-serif', t.color);
    }
    ctx.globalAlpha = 1;
  }

  // Night: darken everything except pools of light, then add warm glows.
  function drawDarkness(blood) {
    const dc = darkCtx;
    dc.setTransform(0.5, 0, 0, 0.5, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, W, H);
    dc.fillStyle = blood ? 'rgba(40, 2, 8, 0.62)' : 'rgba(3, 6, 20, 0.62)';
    dc.fillRect(0, 0, W, H);
    dc.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const g = dc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(LANTERN.x + 40, LANTERN.y + 90, 290, 0.9);
    const flicker = state.t % 7 < 0.15 || state.t % 3.3 < 0.08 ? 0.2 : 0.75;
    hole(STREETLIGHT.x - 10, FIELD_TOP + 60, 200, flicker);
    hole(W / 2, 0, 420, 0.35);
    for (const l of state.lights) hole(l.x, l.y, l.r, 0.9 * (l.life / l.max));
    ctx.drawImage(dark, 0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const warm = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    warm(LANTERN.x, LANTERN.y, 150, 'rgba(251, 191, 36, 0.22)');
    warm(STREETLIGHT.x, STREETLIGHT.y + 6, 60 * flicker + 10, `rgba(254, 240, 138, ${0.35 * flicker})`);
    for (const l of state.lights) warm(l.x, l.y, l.r * 0.35, `rgba(253, 186, 116, ${0.5 * (l.life / l.max)})`);
    for (const gl of glows) warm(gl.x, gl.y, gl.r, gl.color);
    ctx.restore();
  }

  // --- Static scenery (drawn once into an offscreen canvas) -------------------

  function ensureBackground(night, blood, s) {
    const key = `${night}|${blood}|${canvas.width}`;
    if (key === bgKey) return;
    bgKey = key;
    bg.width = canvas.width;
    bg.height = canvas.height;
    const c = bgCtx;
    c.setTransform(s, 0, 0, s, 0, 0);
    const rng = seeded(7);

    // Sky.
    const sky = c.createLinearGradient(0, 0, 0, FIELD_TOP);
    if (blood) {
      sky.addColorStop(0, '#12020a');
      sky.addColorStop(1, '#5a1018');
    } else if (night) {
      sky.addColorStop(0, '#040713');
      sky.addColorStop(1, '#1d2946');
    } else {
      sky.addColorStop(0, '#7fb6ea');
      sky.addColorStop(0.7, '#cfe3f0');
      sky.addColorStop(1, '#f6ddb0');
    }
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    if (night) {
      for (let k = 0; k < 90; k++) {
        c.fillStyle = `rgba(255,255,255,${rng() * 0.6 + 0.1})`;
        c.fillRect(rng() * W, rng() * (FIELD_TOP - 120), 1.4, 1.4);
      }
    }
    // Moon or sun with a halo.
    const mx = 800;
    const my = 118;
    const halo = c.createRadialGradient(mx, my, 10, mx, my, 120);
    halo.addColorStop(0, blood ? 'rgba(248,113,113,0.45)' : night ? 'rgba(226,232,240,0.28)' : 'rgba(255,251,235,0.7)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = halo;
    c.fillRect(mx - 120, my - 120, 240, 240);
    c.fillStyle = blood ? '#f87171' : night ? '#e2e8f0' : '#fffbeb';
    c.beginPath();
    c.arc(mx, my, night ? 26 : 32, 0, Math.PI * 2);
    c.fill();
    if (night) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      [[-8, -6, 6], [7, 5, 4], [-2, 10, 3]].forEach(([dx, dy, r]) => {
        c.beginPath();
        c.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
        c.fill();
      });
    }
    // Wispy clouds.
    c.fillStyle = night ? 'rgba(148,163,184,0.08)' : 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      c.ellipse(rng() * W, 70 + rng() * 110, 80 + rng() * 90, 8 + rng() * 6, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Two layers of ruined skyline.
    const layer = (color, windowColor, minH, maxH, baseY, seed) => {
      const r = seeded(seed);
      let x = -20;
      while (x < W + 20) {
        const bw = 36 + r() * 60;
        const bh = minH + r() * (maxH - minH);
        c.fillStyle = color;
        c.beginPath();
        // Broken, jagged roofline.
        c.moveTo(x, baseY);
        c.lineTo(x, baseY - bh);
        const steps = 3 + Math.floor(r() * 3);
        for (let k = 1; k <= steps; k++) c.lineTo(x + (bw * k) / steps, baseY - bh + (r() < 0.4 ? r() * 18 : 0));
        c.lineTo(x + bw, baseY);
        c.fill();
        if (r() < 0.3) c.fillRect(x + bw * 0.4, baseY - bh - 18, 2, 18); // antenna
        if (windowColor) {
          for (let wy = baseY - bh + 12; wy < baseY - 14; wy += 14) {
            for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
              const v = r();
              if (v < 0.12) {
                c.fillStyle = windowColor;
                c.fillRect(wx, wy, 5, 7);
              } else if (v < 0.5) {
                c.fillStyle = 'rgba(0,0,0,0.25)';
                c.fillRect(wx, wy, 5, 7);
              }
            }
          }
        }
        x += bw + r() * 6;
      }
    };
    layer(blood ? '#1f050a' : night ? '#0b1224' : '#aab3c4', null, 70, 180, FIELD_TOP - 26, 3);
    layer(blood ? '#2a070d' : night ? '#10192e' : '#8a93a6', night ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.25)', 40, 130, FIELD_TOP - 26, 11);
    // Water tower silhouette.
    c.fillStyle = blood ? '#2a070d' : night ? '#10192e' : '#7b8497';
    c.fillRect(470, FIELD_TOP - 200, 44, 30);
    c.fillRect(474, FIELD_TOP - 170, 3, 60);
    c.fillRect(507, FIELD_TOP - 170, 3, 60);
    // Haze where the city meets the street.
    const haze = c.createLinearGradient(0, FIELD_TOP - 80, 0, FIELD_TOP - 20);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(1, blood ? 'rgba(90,16,24,0.5)' : night ? 'rgba(29,41,70,0.6)' : 'rgba(246,221,176,0.5)');
    c.fillStyle = haze;
    c.fillRect(0, FIELD_TOP - 80, W, 60);

    // Sidewalk, curb and road.
    c.fillStyle = night ? '#2b2a2e' : '#b8b2a7';
    c.fillRect(0, FIELD_TOP - 26, W, 14);
    c.fillStyle = night ? '#3a393e' : '#d6d0c4';
    c.fillRect(0, FIELD_TOP - 13, W, 3);
    const road = c.createLinearGradient(0, FIELD_TOP - 10, 0, H);
    road.addColorStop(0, night ? '#232126' : '#8f8a84');
    road.addColorStop(1, night ? '#141216' : '#6b6661');
    c.fillStyle = road;
    c.fillRect(0, FIELD_TOP - 10, W, H);
    // Asphalt grit.
    for (let k = 0; k < 1600; k++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      c.fillRect(rng() * W, FIELD_TOP - 10 + rng() * (H - FIELD_TOP + 10), 2, 1);
    }
    // Cracks.
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      let x = rng() * W;
      let y = FIELD_TOP + rng() * (H - FIELD_TOP);
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rng() * 30 - 10;
        y += rng() * 10 - 5;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // Faded lane markings.
    c.fillStyle = night ? 'rgba(250,250,240,0.12)' : 'rgba(250,250,240,0.45)';
    const mid = (FIELD_TOP + FIELD_BOT) / 2;
    for (let x = 300; x < W; x += 74) c.fillRect(x, mid - 2, 38, 4);

    // Props on the sidewalk: a burnt-out car, tyres and a bent sign.
    const prop = night ? '#17151a' : '#4b4640';
    c.fillStyle = prop;
    c.beginPath();
    c.roundRect(740, FIELD_TOP - 52, 150, 30, 8);
    c.fill();
    c.beginPath();
    c.moveTo(770, FIELD_TOP - 52);
    c.lineTo(790, FIELD_TOP - 76);
    c.lineTo(850, FIELD_TOP - 76);
    c.lineTo(868, FIELD_TOP - 52);
    c.fill();
    c.fillStyle = night ? '#0b0a0d' : '#2f2b27';
    c.fillRect(794, FIELD_TOP - 72, 24, 18);
    c.fillRect(824, FIELD_TOP - 72, 24, 18);
    [[770, 1], [860, 1]].forEach(([wx]) => {
      c.beginPath();
      c.arc(wx, FIELD_TOP - 22, 11, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = prop;
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.ellipse(412, FIELD_TOP - 24 - k * 9, 14, 5, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(560, FIELD_TOP - 88, 3, 70);
    c.save();
    c.translate(561, FIELD_TOP - 88);
    c.rotate(0.35);
    c.fillStyle = night ? '#3b3a2a' : '#b59f3b';
    c.fillRect(-12, -12, 24, 18);
    c.restore();
    // Street light pole (the lamp head is drawn live so it can flicker).
    c.fillStyle = night ? '#1f1d24' : '#57534e';
    c.fillRect(STREETLIGHT.x + 16, STREETLIGHT.y, 4, FIELD_TOP - 20 - STREETLIGHT.y);
    c.fillRect(STREETLIGHT.x - 4, STREETLIGHT.y - 2, 24, 4);
    c.fillStyle = night ? '#e7e2c8' : '#8a857a';
    c.beginPath();
    c.ellipse(STREETLIGHT.x - 4, STREETLIGHT.y + 3, 9, 4, 0, 0, Math.PI * 2);
    c.fill();
  }

  // --- Defences ------------------------------------------------------------------

  // The barricade is a row of front-facing sections, one per depth band,
  // drawn far to near so nearer sections overlap farther ones.
  const SECTION_YS = [];
  for (let y = FIELD_TOP - 8; y <= FIELD_BOT + 12; y += 24) SECTION_YS.push(y);

  function drawWall() {
    const frac = state.barricade / tier().max;
    const t = state.build.tier;
    const r = seeded(21);
    for (const y of SECTION_YS) {
      const d = depth(y);
      const cx = wallX(y);
      const w = 50 * d;
      const h = WALL.height * d;
      const x0 = cx - w / 2;
      const top = y - h;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.6, 5 * d, 0, 0, Math.PI * 2);
      ctx.fill();

      if (state.barricade <= 0) {
        // Rubble.
        for (let k = 0; k < 3; k++) {
          ctx.save();
          ctx.translate(x0 + r() * w, y - 3 * d - r() * 4);
          ctx.rotate(r() * 1.2 - 0.6);
          ctx.beginPath();
          ctx.rect(-12 * d, -3 * d, 24 * d, 6 * d);
          fillOutline(['#78350f', '#92400e', '#57534e'][k % 3], 1);
          ctx.restore();
        }
        continue;
      }

      // Posts.
      for (const px of [x0 + 3 * d, x0 + w - 8 * d]) {
        ctx.beginPath();
        ctx.rect(px, top - 6 * d, 5 * d, h + 6 * d);
        fillOutline('#3f2a14', 1);
      }
      // Boards or sheets, with pieces missing as the barricade is damaged.
      const rows = 6;
      for (let p = 0; p < rows; p++) {
        const py = top + 4 * d + p * (h - 10 * d) / rows;
        const ph = (h - 10 * d) / rows - 1.5 * d;
        for (let half = 0; half < 2; half++) {
          const keep = r();
          if (keep > frac * 1.15 + 0.05) continue;
          const tilt = (r() - 0.5) * 0.08;
          const bx = x0 + (half ? w / 2 - 1 : -2 * d);
          const bw = w / 2 + 3 * d;
          ctx.save();
          ctx.translate(bx + bw / 2, py + ph / 2);
          ctx.rotate(tilt);
          ctx.beginPath();
          ctx.rect(-bw / 2, -ph / 2, bw, ph);
          if (t === 2) {
            fillOutline((p + half) % 2 ? '#6b7280' : '#7b8390', 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            for (let q = -bw / 2 + 4 * d; q < bw / 2; q += 5 * d) {
              ctx.beginPath();
              ctx.moveTo(q, -ph / 2 + 1);
              ctx.lineTo(q, ph / 2 - 1);
              ctx.stroke();
            }
            ctx.fillStyle = '#d1d5db';
            ctx.fillRect(-bw / 2 + 2 * d, -1, 1.6 * d, 1.6 * d);
            ctx.fillRect(bw / 2 - 3.6 * d, -1, 1.6 * d, 1.6 * d);
          } else {
            fillOutline(['#92400e', '#a16207', '#7c3f12'][(p + half) % 3], 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-bw / 2 + 2, 0);
            ctx.lineTo(bw / 2 - 2, 0);
            ctx.stroke();
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(-bw / 2 + 3 * d, -1, 1.5 * d, 1.5 * d);
            ctx.fillRect(bw / 2 - 4.5 * d, -1, 1.5 * d, 1.5 * d);
          }
          ctx.restore();
        }
      }
      // Reinforcement: a bolted metal plate on some sections.
      if (t === 1 && r() < 0.7 && r() < frac * 1.2) {
        const pw = w * 0.45;
        const ph = h * 0.35;
        const px = x0 + r() * (w - pw);
        const py = top + h * 0.2 + r() * h * 0.3;
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        fillOutline('#78716c', 1);
        ctx.fillStyle = '#d6d3d1';
        for (const [bx, by] of [[px + 2, py + 2], [px + pw - 4, py + 2], [px + 2, py + ph - 4], [px + pw - 4, py + ph - 4]]) {
          ctx.fillRect(bx, by, 2, 2);
        }
      }
      // Sandbags along the foot of the section.
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x0 + (k + 0.5) * (w / 3), y - 4 * d, w / 5.2, 5 * d, 0, 0, Math.PI * 2);
        fillOutline(k % 2 ? '#a8946a' : '#9a8660', 1);
      }
    }
  }

  function drawWire() {
    if (!state.build.wire || state.barricade <= 0) return;
    for (const y of SECTION_YS) {
      const d = depth(y);
      const cx = wallX(y) + 30 * d;
      for (let row = 0; row < state.build.wire; row++) {
        const cy = y - (9 + row * 13) * d;
        ctx.strokeStyle = row % 2 ? '#9ca3af' : '#71717a';
        ctx.lineWidth = 1.1;
        for (let k = -3; k <= 3; k++) {
          const lx = cx + k * 7 * d;
          ctx.beginPath();
          ctx.ellipse(lx, cy, 4.5 * d, 6 * d, 0.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lx + 3 * d, cy - 6 * d);
          ctx.lineTo(lx + 5 * d, cy - 8.5 * d);
          ctx.stroke();
        }
      }
    }
  }

  function drawSpikes() {
    const lvl = state.build.spikes;
    if (!lvl) return;
    const r = seeded(99);
    const count = lvl === 1 ? 22 : 38;
    for (let k = 0; k < count; k++) {
      const y = FIELD_TOP + r() * (FIELD_BOT - FIELD_TOP);
      const d = depth(y);
      const x = wallX(y) + 56 + r() * 64;
      const len = (12 + r() * 6) * d;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.5 + r() * 0.2);
      ctx.beginPath();
      ctx.moveTo(-2.5 * d, 0);
      ctx.lineTo(2.5 * d, 0);
      ctx.lineTo(0, -len);
      ctx.closePath();
      fillOutline(lvl === 2 ? '#9ca3af' : '#a16207', 1);
      ctx.restore();
    }
  }

  function drawMine(m, night) {
    const d = depth(m.y);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 8 * d, 3.5 * d, 0, 0, Math.PI * 2);
    fillOutline('#3f3f46', 1);
    const on = (state.t + m.blink) % 1 < 0.2;
    ctx.fillStyle = on ? '#ef4444' : '#7f1d1d';
    ctx.fillRect(m.x - 1, m.y - 3 * d, 2, 2);
    if (on && night) glows.push({ x: m.x, y: m.y - 3, r: 8, color: 'rgba(239,68,68,0.6)' });
  }

  // --- Characters ------------------------------------------------------------------

  function drawZombie(z, night) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const white = z.flash > 0;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, t.w * 0.7 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(s, s);
    if (z.type === 'crawler') drawCrawler(z, t, white, night);
    else drawHumanoid(z, t, white, night, 0);
    ctx.restore();

    if (z.rage > 0) {
      const g = geom(z);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', g.head.x, g.head.y - g.head.r - 4);
    }
    if (z.hp < z.maxHp) {
      const g = geom(z);
      const bw = (z.type === 'boss' ? 70 : 22) * s;
      const y = g.head.y - g.head.r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(z.x - bw / 2, y, bw, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(z.x - bw / 2, y, bw * clamp(z.hp / z.maxHp, 0, 1), 3);
    }
  }

  function drawCorpse(c) {
    const z = c.z;
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const fall = Math.min(1, c.t / 0.35);
    ctx.save();
    ctx.globalAlpha = clamp((8 - c.t) / 2, 0, 1) * 0.9;
    ctx.translate(z.x, z.y);
    ctx.scale(s, s);
    const still = { ...z, moving: false, attack: 0, flash: 0, rage: 0 };
    if (z.type === 'crawler') {
      drawCrawler(still, t, false, false);
    } else {
      ctx.rotate(fall * (Math.PI / 2 - 0.1));
      drawHumanoid(still, t, false, false, fall);
    }
    ctx.restore();
  }

  // An upright zombie facing left, feet at the origin, in unscaled units.
  function drawHumanoid(z, t, white, night, fallen) {
    const k = t.h / 48;
    const bw = t.bulk;
    const phase = z.walk;
    const stride = z.moving ? Math.sin(phase) : 0;
    const lift = z.moving ? Math.cos(phase) : 0;
    const lunge = z.attack > 0 ? Math.sin((z.attack / 0.3) * Math.PI) : 0;
    const skin = white ? '#ffffff' : z.skin;
    const shirt = white ? '#ffffff' : z.shirt;
    const pants = white ? '#ffffff' : z.pants;
    const hipY = -22 * k;

    ctx.save();
    ctx.scale(k, k);
    const hip = -22;
    // Legs: back leg darker, with a knee bend while walking.
    const leg = (dir, color) => {
      const foot = dir * stride * 7;
      const knee = [foot * 0.5 - 2, hip / 2 + (dir * lift > 0 ? -3 : 0)];
      limb([[0, hip], knee, [foot, -1]], 5 * Math.min(bw, 1.5), color);
      ctx.beginPath();
      ctx.ellipse(foot - 2, -1, 4.5, 2.2, 0, 0, Math.PI * 2);
      fillOutline(white ? '#fff' : '#1c1917', 1);
    };
    leg(-1, white ? '#fff' : shade(pants, 0.7));
    leg(1, pants);
    ctx.restore();

    // Upper body, tipped forward.
    ctx.save();
    ctx.translate(0, hipY);
    ctx.scale(k, k);
    ctx.rotate(t.lean - lunge * 0.12);
    const sway = z.moving ? Math.sin(phase * 0.5) * 2 : 0;
    const armW = 3.8 * Math.min(bw, 1.6);

    // Back arm.
    limb([[1, -15], [-8, -11 + sway], [-18 - lunge * 6, -14 + sway]], armW, white ? '#fff' : shade(z.skin, 0.75));

    // Torso with a ragged hem.
    const tw = 7 * bw;
    ctx.beginPath();
    ctx.moveTo(-tw, 2);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-tw + (i * tw * 2) / 6, 2 + (i % 2 ? 4 : 0));
    ctx.lineTo(tw * 0.85, -18);
    ctx.quadraticCurveTo(0, -22, -tw * 0.85, -18);
    ctx.closePath();
    fillOutline(shirt);
    if (!white) {
      // Shading on the back, a blood stain on the front.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(tw * 0.2, 2);
      ctx.lineTo(tw, 2);
      ctx.lineTo(tw * 0.85, -18);
      ctx.lineTo(tw * 0.1, -20);
      ctx.fill();
      ctx.fillStyle = 'rgba(127,29,29,0.55)';
      ctx.beginPath();
      ctx.ellipse(-tw * 0.4, -8, 3, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (z.type === 'riot' && !white) {
      ctx.beginPath();
      ctx.roundRect(-tw * 0.9, -17, tw * 1.8, 13, 3);
      fillOutline('#1f2937');
      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 4px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, -9);
    }
    if (z.type === 'exploder') {
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 8 + z.walk);
      ctx.beginPath();
      ctx.ellipse(-3, -6, tw * 0.95, 10, 0, 0, Math.PI * 2);
      fillOutline(white ? '#fff' : '#9f7a4a');
      for (const [px, py, pr] of [[-8, -9, 3], [-2, -2, 2.5], [2, -11, 2], [-6, 0, 2]]) {
        ctx.fillStyle = `rgba(251, 146, 60, ${0.6 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        if (night && !fallen) glows.push({ ...toWorld(px, py), r: 10, color: `rgba(251,146,60,${0.3 + pulse * 0.3})` });
      }
    }
    if (z.type === 'boss' && !white) {
      ctx.fillStyle = '#e7e5e4';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(tw * 0.4 + i * 2, -18 + i * 5);
        ctx.lineTo(tw * 0.9 + 8 + i * 2, -24 + i * 5);
        ctx.lineTo(tw * 0.6 + i * 2, -13 + i * 5);
        ctx.fill();
      }
    }

    // Head.
    const r = t.headR / k;
    const hx = -2;
    const hy = -18 - r * 0.9;
    if (z.type === 'spitter' && !white) {
      ctx.beginPath();
      ctx.ellipse(hx - 1, hy + r * 0.9, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
      fillOutline('#65a30d');
    }
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    fillOutline(skin);
    if (!white) {
      if (z.hair) {
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(hx + 1, hy - 1, r, Math.PI * 1.05, Math.PI * 1.9);
        ctx.fill();
      }
      // Jaw.
      ctx.fillStyle = '#3b0a0a';
      ctx.beginPath();
      const jaw = z.type === 'screamer' ? 0.55 : 0.3 + lunge * 0.2;
      ctx.ellipse(hx - r * 0.55, hy + r * 0.45, r * 0.3, r * jaw, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Eye.
      const ex = hx - r * 0.5;
      const ey = hy - r * 0.2;
      ctx.fillStyle = night ? '#d9f99d' : '#1c1917';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.1, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
      if (night && !fallen) glows.push({ ...toWorld(ex, ey), r: 5 * k, color: 'rgba(190,242,100,0.55)' });
    }
    if (z.type === 'riot' && z.helmet > 0) {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 1.5, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      fillOutline(white ? '#fff' : '#1e3a8a');
      ctx.fillStyle = 'rgba(147,197,253,0.55)';
      ctx.fillRect(hx - r - 1.5, hy - 1, r * 0.9, 3);
    }

    // Front arm, reaching for the wall.
    limb([[-1, -16], [-10, -12 - sway], [-20 - lunge * 7, -15 - sway]], armW, skin);
    ctx.restore();
  }

  function drawCrawler(z, t, white, night) {
    const sway = z.moving ? Math.sin(z.walk) : 0;
    const lunge = z.attack > 0 ? Math.sin((z.attack / 0.3) * Math.PI) : 0;
    const skin = white ? '#fff' : z.skin;
    // Dragging legs.
    limb([[8, -6], [18, -3], [26, -1]], 4.5, white ? '#fff' : z.pants);
    ctx.beginPath();
    ctx.roundRect(-t.w / 2, -t.h, t.w, t.h - 3, 5);
    fillOutline(white ? '#fff' : z.shirt);
    limb([[-t.w / 2 + 6, -9], [-t.w / 2 - 4 - sway * 3, -5], [-t.w / 2 - 12 - lunge * 6 - sway * 3, -1]], 3.5, skin);
    ctx.beginPath();
    ctx.arc(-t.w / 2 - 5, -11, t.headR, 0, Math.PI * 2);
    fillOutline(skin);
    const ex = -t.w / 2 - 9;
    const ey = -13;
    ctx.fillStyle = night ? '#d9f99d' : '#1c1917';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.1, 0, Math.PI * 2);
    ctx.fill();
    if (night) glows.push({ ...toWorld(ex, ey), r: 5, color: 'rgba(190,242,100,0.55)' });
  }

  // Convert a point in the current drawing transform to canvas coordinates.
  function toWorld(x, y) {
    const m = ctx.getTransform();
    const s = canvas.width / W;
    return { x: (m.a * x + m.c * y + m.e) / s, y: (m.b * x + m.d * y + m.f) / s };
  }

  function drawGun(kind, flash) {
    const metal = '#27272a';
    const wood = '#7c4a1e';
    const part = (x, y, w, h, color, r = 1) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      fillOutline(color, 1);
    };
    let len;
    if (kind === 'pistol') {
      part(0, -4, 14, 5, metal);
      part(1, 0, 4, 7, '#3f3f46');
      len = 14;
    } else if (kind === 'shotgun') {
      part(-10, -4, 12, 6, wood, 2);
      part(0, -4, 30, 4, metal);
      part(13, -1, 9, 4, wood);
      len = 30;
    } else if (kind === 'smg') {
      part(-6, -4, 8, 5, metal);
      part(0, -5, 20, 7, metal);
      part(8, 2, 4, 9, '#3f3f46');
      part(20, -3, 6, 3, metal);
      len = 26;
    } else if (kind === 'rifle') {
      part(-12, -3, 14, 6, wood, 2);
      part(0, -4, 34, 4, metal);
      part(6, -9, 12, 4, '#18181b', 2);
      len = 34;
    } else {
      part(-8, -4, 10, 7, metal);
      part(0, -5, 26, 8, metal);
      part(26, -3, 12, 3, metal);
      part(6, 3, 9, 8, '#4d7c0f');
      len = 38;
    }
    if (flash > 0) {
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(len, -6);
      ctx.lineTo(len + 16, -1);
      ctx.lineTo(len + 6, 0);
      ctx.lineTo(len + 16, 1);
      ctx.lineTo(len, 6);
      ctx.fill();
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.arc(len + 2, -1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A person facing right with feet at (x, y), holding a gun aimed at `aim`.
  function drawPerson(x, y, o) {
    ctx.save();
    ctx.translate(x, y);
    // Legs and boots.
    limb([[0, -22], [-3, -11], [-5, -1]], 5, shade(o.pants, 0.8));
    limb([[0, -22], [4, -11], [5, -1]], 5, o.pants);
    for (const fx of [-5, 6]) {
      ctx.beginPath();
      ctx.roundRect(fx - 3, -3, 8, 4, 2);
      fillOutline('#1c1917', 1);
    }
    // Torso and vest.
    ctx.beginPath();
    ctx.roundRect(-7, -41, 14, 21, 4);
    fillOutline(o.jacket);
    ctx.beginPath();
    ctx.roundRect(-5, -39, 10, 14, 3);
    fillOutline(shade(o.vest || '#3f3f46', 1), 1);
    // Head.
    ctx.beginPath();
    ctx.arc(1, -48, 7, 0, Math.PI * 2);
    fillOutline('#f5d0a9');
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(4, -50, 1.8, 1.8);
    if (o.hat === 'helmet') {
      ctx.beginPath();
      ctx.arc(1, -49, 8.2, Math.PI, Math.PI * 2);
      ctx.closePath();
      fillOutline('#4d5a2a');
    } else if (o.hat === 'cap') {
      ctx.beginPath();
      ctx.arc(1, -50, 7.2, Math.PI, Math.PI * 2);
      ctx.closePath();
      fillOutline(o.jacket);
      ctx.fillRect(4, -51, 7, 2);
    } else if (o.hat === 'band') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(-6, -52, 14, 3);
    } else {
      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.arc(0, -50, 7, Math.PI, Math.PI * 1.9);
      ctx.fill();
    }
    // Arms and gun.
    ctx.save();
    ctx.translate(3 - o.recoil * 3 * Math.cos(o.aim), -38 - o.recoil * 3 * Math.sin(o.aim));
    ctx.rotate(o.aim);
    limb([[-2, 0], [6, 3], [10, 1]], 3.5, shade(o.jacket, 0.8));
    drawGun(o.gun, o.flash);
    limb([[0, -1], [10, 2], [17, 0]], 3.5, o.jacket);
    ctx.restore();
    ctx.restore();
  }

  function drawTower() {
    const top = PLAYER.y;
    const ground = 452;
    const x0 = PLAYER.x - 30;
    const x1 = PLAYER.x + 30;
    // Legs and bracing.
    for (const px of [x0 + 4, x1 - 8]) {
      ctx.beginPath();
      ctx.rect(px, top, 5, ground - top);
      fillOutline('#4a2f17');
    }
    limb([[x0 + 6, top + 8], [x1 - 6, ground - 6]], 3, '#5b3a1c');
    limb([[x1 - 6, top + 8], [x0 + 6, ground - 6]], 3, '#5b3a1c');
    // Lantern pole and lantern.
    ctx.beginPath();
    ctx.rect(LANTERN.x - 12, LANTERN.y - 20, 3, ground - LANTERN.y + 20);
    fillOutline('#3f2a14', 1);
    ctx.beginPath();
    ctx.rect(LANTERN.x - 12, LANTERN.y - 20, 14, 3);
    fillOutline('#3f2a14', 1);
    ctx.beginPath();
    ctx.roundRect(LANTERN.x - 3, LANTERN.y - 14, 8, 11, 2);
    fillOutline('#fbbf24', 1);
    // Platform.
    ctx.beginPath();
    ctx.rect(x0, top, x1 - x0, 7);
    fillOutline('#7c4a1e');
    // Player.
    const w = WEAPONS[state.gun];
    drawPerson(PLAYER.x, PLAYER.y, {
      jacket: '#35502d', pants: '#2e3a28', vest: '#3f3f46', hat: 'helmet',
      aim: aimAngle(), gun: w.kind, flash: state.flash, recoil: state.recoil,
    });
    // Sandbag parapet in front of the player's legs.
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(PLAYER.x + 14 + (k % 2) * 6, top - 4 - k * 7, 13, 5, 0, 0, Math.PI * 2);
      fillOutline(k % 2 ? '#a8946a' : '#9a8660', 1);
    }
  }

  function drawSurvivor(sv) {
    const gunKind = ['rifle', 'shotgun', 'smg', 'rifle'][state.survivors.indexOf(sv) % 4];
    drawPerson(sv.x, sv.y, {
      jacket: sv.jacket, pants: sv.pants, vest: '#44403c', hat: sv.hat,
      aim: sv.aim || 0, gun: gunKind, flash: sv.flash, recoil: 0,
    });
  }

  // --- HUD ------------------------------------------------------------------------

  function drawHud() {
    const hover = hitTest(input.mx, input.my);
    const g = ctx.createLinearGradient(0, 0, 0, BAR);
    g.addColorStop(0, 'rgba(20,16,14,0.88)');
    g.addColorStop(1, 'rgba(12,10,9,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillStyle = 'rgba(254,243,199,0.12)';
    ctx.fillRect(0, BAR - 1, W, 1);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const label = state.phase === 'night' ? `Night ${state.night}` : `Day ${state.night}`;
    ctx.fillText(label, 14, 25);
    const labelW = ctx.measureText(label).width;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`of ${NIGHTS}`, 20 + labelW, 25);
    ctx.fillStyle = '#d6d3d1';
    if (state.phase === 'night') {
      const left = state.spawns.length + state.zombies.length;
      if (state.bloodMoon) {
        ctx.fillStyle = '#fca5a5';
        ctx.fillText(`Blood moon · ${left} left`, 14, 44);
      } else ctx.fillText(`${left} zombie${left === 1 ? '' : 's'} left`, 14, 44);
    } else {
      ctx.fillText(`${state.stats.kills} kills so far`, 14, 44);
    }

    bar(150, 12, 150, 'Barricade', state.barricade, tier().max, '#d97706');
    bar(150, 34, 150, 'You', state.hp, PLAYER_MAX, '#22c55e');
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#d6d3d1';
    ctx.fillText(`Materials ${state.res.materials}`, 316, 25);
    ctx.fillText(`Medkits ${state.res.meds} · Crew ${state.survivors.length}`, 316, 44);

    for (const slot of gunSlots()) {
      const gun = state.guns[slot.i];
      const w = WEAPONS[slot.i];
      const active = slot.i === state.gun;
      const hot = hover && hover.id === slot.id;
      ctx.globalAlpha = gun.owned ? 1 : 0.35;
      ctx.fillStyle = active ? '#fef3c7' : hot ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, slot.x, slot.y, slot.w, slot.h, 7);
      ctx.fill();
      ctx.fillStyle = active ? '#1c1917' : '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(gun.owned ? w.short : '???', slot.x + 7, slot.y + 16);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = active ? '#44403c' : '#d6d3d1';
      if (gun.owned) ctx.fillText(gun.reserve === Infinity ? `${gun.mag} / ∞` : `${gun.mag} / ${gun.reserve}`, slot.x + 7, slot.y + 32);
      ctx.textAlign = 'right';
      ctx.fillStyle = active ? '#78716c' : '#a8a29e';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText(String(slot.i + 1), slot.x + slot.w - 6, slot.y + 12);
      if (active && state.reloadT > 0) {
        ctx.fillStyle = '#d97706';
        ctx.fillRect(slot.x + 4, slot.y + slot.h - 5, (slot.w - 8) * (1 - state.reloadT / w.reload), 3);
      }
      ctx.globalAlpha = 1;
    }

    for (const b of sysButtons()) {
      const hot = hover && hover.id === b.id;
      ctx.fillStyle = hot ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)';
      roundRect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function bar(x, y, w, label, v, max, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, x, y, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(14, w * clamp(v / max, 0, 1)), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} ${Math.ceil(v)}/${max}`, x + w / 2, y + 11);
  }

  function drawIntro() {
    ctx.globalAlpha = clamp(state.introT, 0, 1);
    ctx.textAlign = 'center';
    outlined(`Night ${state.night}`, W / 2, 170, 'bold 44px system-ui, sans-serif', state.bloodMoon ? '#fca5a5' : '#fef3c7');
    let sub = `${state.nightTotal} zombies are coming`;
    if (state.night === 1) sub = 'Aim with the mouse, click to shoot, R to reload';
    else if (BOSS_NIGHTS.includes(state.night)) sub = 'Something huge is coming tonight';
    else if (state.bloodMoon) sub = `Blood moon: ${state.nightTotal} restless zombies`;
    outlined(sub, W / 2, 200, '600 15px system-ui, sans-serif', '#e7e5e4');
    ctx.globalAlpha = 1;
  }

  function drawButton(b, hover, style, label) {
    const hot = hover && hover.id === b.id;
    ctx.globalAlpha = b.disabled ? 0.4 : 1;
    if (style === 'primary') ctx.fillStyle = hot ? '#f59e0b' : '#d97706';
    else if (style === 'selected') ctx.fillStyle = '#fef3c7';
    else ctx.fillStyle = hot && !b.disabled ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.16)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    if (label !== undefined) {
      ctx.fillStyle = style === 'selected' ? '#1c1917' : '#fff';
      ctx.font = `bold ${style === 'primary' ? 15 : b.h > 34 ? 18 : 12}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  function wrapText(text, x, y, width, lineH) {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        ctx.fillText(line, x, y + lines * lineH);
        lines++;
        line = word;
      } else line = test;
    }
    ctx.fillText(line, x, y + lines * lineH);
    return lines + 1;
  }

  function drawDayPanel() {
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(12,10,9,0.88)';
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(RX - 22, PANEL.y + 20, 1, PANEL.h - 90);

    // Left column: the plan, or what happened.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 22px system-ui, sans-serif';
    if (state.phase === 'day') {
      ctx.fillText(`Day ${state.night}`, LX, PANEL.y + 36);
      const left = DAY_HOURS - planUsed();
      ctx.fillStyle = left ? '#fde68a' : '#a8a29e';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`${DAY_HOURS} hours until dark · ${left ? `${left} unassigned` : 'every hour assigned'}`, LX, PANEL.y + 56);
      const p = state.plan;
      const loc = LOCATIONS.find((l) => l.id === p.location);
      const notes = {
        repair: ['Repair the barricade', `+${p.repair * repairPerHour()} (${repairPerHour()} per hour, more with a crew)`],
        scavenge: ['Scavenging run', `${loc.name}: ${loc.desc} ${loc.riskLabel}.`],
        search: ['Search for survivors',
          state.survivors.length >= MAX_SURVIVORS ? 'Your crew is full' : 'Survivors shoot at night and speed up repairs'],
      };
      for (const row of PLAN_ROWS) {
        const [name, note] = notes[row.key];
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText(name, LX, row.y + 13);
        ctx.fillStyle = '#a8a29e';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(note, LX, row.y + 30);
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${p[row.key]}h`, LX + 371, row.y + 22);
      }
      for (const b of dayButtons()) {
        if (b.loc) {
          const sel = p.location === b.loc.id;
          drawButton(b, hover, sel ? 'selected' : 'plain');
          ctx.textAlign = 'center';
          ctx.fillStyle = sel ? '#1c1917' : '#fff';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText(b.loc.name, b.x + b.w / 2, b.y + 19);
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = sel ? '#78716c' : b.loc.risk > 0.1 ? '#fca5a5' : '#a8a29e';
          ctx.fillText(b.loc.riskLabel, b.x + b.w / 2, b.y + 34);
        } else {
          drawButton(b, hover, 'plain', b.label);
        }
      }
    } else {
      ctx.fillText('Dusk', LX, PANEL.y + 36);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Here is how the day went. Spend your materials before dark.', LX, PANEL.y + 56);
      let y = PANEL.y + 88;
      for (const line of state.results) {
        ctx.font = line.big ? 'bold 14px system-ui, sans-serif' : '13px system-ui, sans-serif';
        ctx.fillStyle = line.tone === 'good' ? '#fde047' : line.tone === 'bad' ? '#fca5a5' : line.tone === 'warn' ? '#f87171' : '#e7e5e4';
        y += wrapText(line.text, LX, y, RX - LX - 40, 18) * 18 + 6;
      }
    }

    // Right column: building and supplies.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Build & supplies', RX, PANEL.y + 36);
    ctx.fillStyle = '#fde68a';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${state.res.materials} materials · ${state.res.meds} medkit${state.res.meds === 1 ? '' : 's'} · Health ${Math.ceil(state.hp)}`,
      RX, PANEL.y + 56);
    for (const b of buildButtons()) {
      const row = b.row;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(row.name, RX, b.y + 13);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(row.desc, RX, b.y + 29);
      const label = row.cost === null ? 'Maxed' : row.cost === 'use' ? 'Use' : `Build · ${row.cost}`;
      drawButton({ ...b, disabled: !row.ok }, hover, 'plain', label);
    }

    const pb = primaryButton();
    drawButton(pb, hover, 'primary', pb.label);
    ctx.fillStyle = '#78716c';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Enter', pb.x + pb.w + 30, pb.y + 25);
  }

  function drawCursor() {
    const overButton = hitTest(input.mx, input.my);
    const aiming = state && state.phase === 'night' && state.mode === 'playing' && input.over && !overButton;
    canvas.style.cursor = aiming ? 'none' : overButton ? 'pointer' : 'default';
    if (!aiming) return;
    const w = WEAPONS[state.gun];
    const m = muzzle();
    const dist = Math.hypot(input.mx - m.x, input.my - m.y);
    const r = 6 + (w.spread + state.heat) * dist;
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(input.mx, input.my, r, 0, Math.PI * 2);
    ctx.moveTo(input.mx - r - 5, input.my);
    ctx.lineTo(input.mx - r + 3, input.my);
    ctx.moveTo(input.mx + r - 3, input.my);
    ctx.lineTo(input.mx + r + 5, input.my);
    ctx.moveTo(input.mx, input.my - r - 5);
    ctx.lineTo(input.mx, input.my - r + 3);
    ctx.moveTo(input.mx, input.my + r - 3);
    ctx.lineTo(input.mx, input.my + r + 5);
    ctx.stroke();
    const g = state.guns[state.gun];
    ctx.textAlign = 'left';
    const txt = state.reloadT > 0 ? 'Reloading…' : g.mag === 0 ? (g.reserve > 0 ? 'Reload (R)' : 'Empty') : `${g.mag}`;
    outlined(txt, input.mx + r + 8, input.my + r + 12, '600 11px system-ui, sans-serif', g.mag === 0 ? '#fca5a5' : '#fef3c7');
  }

  // ---------------------------------------------------------------------------
  // Overlays (menu, pause, game over) and input
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    const best = loadBest();
    const bestLine = best
      ? `<p class="help">Best run: ${best.won ? `survived all ${NIGHTS} nights` : `reached night ${best.night}`}, ${best.kills} kills.</p>`
      : '';
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2>Nameless Stand</h2>
          <p>Hold the barricade through the night. Scavenge, build and recruit by day. Survive ${NIGHTS} nights.</p>
          <div class="row"><button type="button" class="primary" data-act="start">Start</button></div>
          <p class="help">Mouse to aim and shoot · R reload · 1–5 or scroll to switch guns · P pause · F fullscreen</p>
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
      const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
      const prev = state.prevBest;
      const reached = state.won ? NIGHTS : state.night;
      const record = !prev || reached > prev.night || (reached === prev.night && s.kills > prev.kills);
      overlay.innerHTML = `
        <div>
          <h2>${state.won ? 'You made it' : 'Overrun'}</h2>
          <p>${state.won ? `Rescue arrives after night ${NIGHTS}.` : `You fell on night ${state.night}.`}</p>
          <p>${s.kills} kills · ${s.headshots} headshots · ${acc}% accuracy</p>
          ${record ? '<p class="help">New best run!</p>' : bestLine}
          <div class="row">
            <button type="button" class="primary" data-act="start">Play again</button>
            <button type="button" data-act="menu">Menu</button>
          </div>
        </div>`;
    }
    overlay.classList.add('open');
  }

  // The menu sits over an idle first night so the scene is visible behind it.
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
    input.down = false;
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
    if (!state || state.phase !== 'night') return;
    input.down = true;
    canvas.setPointerCapture(e.pointerId);
    tryFire();
  });
  window.addEventListener('pointerup', () => {
    input.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!state || state.mode !== 'playing' || state.phase !== 'night') return;
    e.preventDefault();
    cycleGun(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.muted = !Sound.muted; return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state || state.mode !== 'playing') return;
    if (k === 'r') startReload();
    else if (k >= '1' && k <= '5') switchGun(Number(k) - 1);
    else if (k === 'enter' && state.phase === 'day') activate('spend');
    else if (k === 'enter' && state.phase === 'results') activate('night');
    else return;
    e.preventDefault();
  });

  // Pause automatically when the tab is hidden.
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

  // Hooks for automated testing (?autoplay plays with an aim bot).
  window.__ns = {
    get state() { return state; },
    input,
    start,
    spawn: spawnZombie,
    build: doBuild,
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
