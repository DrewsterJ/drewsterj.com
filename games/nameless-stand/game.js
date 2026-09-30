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
  const BARRICADE_X = 232;
  const PLAYER = { x: 92, y: 392 }; // feet position, standing on a crate
  const NIGHTS = 15;
  const DAY_HOURS = 12;
  const BARRICADE_MAX = 500;
  const PLAYER_MAX = 100;
  const MAX_SURVIVORS = 4;

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const AIM_ERROR = Number(params.get('aim')) || 10; // autoplay aim wobble, in pixels
  const AIM_SLEW = Number(params.get('slew')) || 900; // autoplay mouse speed, in pixels per second

  // Weapons, in the order they are found while scavenging.
  const WEAPONS = [
    { name: 'Pistol', short: 'Pistol', dmg: 24, rate: 0.2, auto: false, mag: 12, reload: 1.1,
      spread: 0.012, bloom: 0.012, pellets: 1, pierce: 1, find: 0, len: 16, snd: [1500, 0.16] },
    { name: 'Shotgun', short: 'Shotgun', dmg: 14, rate: 0.75, auto: false, mag: 6, reload: 2.0,
      spread: 0.1, bloom: 0, pellets: 8, pierce: 1, find: 18, len: 26, snd: [700, 0.3] },
    { name: 'SMG', short: 'SMG', dmg: 15, rate: 0.075, auto: true, mag: 32, reload: 1.6,
      spread: 0.03, bloom: 0.006, pellets: 1, pierce: 1, find: 90, len: 20, snd: [1900, 0.1] },
    { name: 'Hunting Rifle', short: 'Rifle', dmg: 95, rate: 0.85, auto: false, mag: 5, reload: 1.9,
      spread: 0, bloom: 0, pellets: 1, pierce: 3, find: 16, len: 32, snd: [900, 0.28] },
    { name: 'Machine Gun', short: 'MG', dmg: 22, rate: 0.065, auto: true, mag: 100, reload: 3.6,
      spread: 0.045, bloom: 0.004, pellets: 1, pierce: 1, find: 140, len: 30, snd: [1200, 0.18] },
  ];

  const ZOMBIES = {
    walker: { hp: 70, speed: 34, dmg: 10, rate: 1.0, w: 18, h: 48, score: 10 },
    runner: { hp: 40, speed: 80, dmg: 6, rate: 0.7, w: 16, h: 44, score: 15 },
    crawler: { hp: 45, speed: 26, dmg: 8, rate: 0.9, w: 34, h: 16, score: 15 },
    brute: { hp: 320, speed: 22, dmg: 30, rate: 1.4, w: 32, h: 64, score: 50 },
  };

  const SHIRTS = ['#57534e', '#44403c', '#475569', '#7c2d12', '#365314', '#3f3f46', '#713f12'];
  const HEADSHOT = 2.5;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const depth = (y) => 0.8 + 0.4 * ((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP));
  const repairPerHour = () => Math.round(30 * (1 + 0.25 * state.survivors.length));

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
    groan() {
      this.play('groan', 1.2, () => this.tone(rand(70, 110), rand(0.6, 1.1), 'sawtooth', 0.025, rand(50, 70)));
    },
    knock() { this.play('knock', 0.12, () => this.noise(0.12, 0.2, 400)); },
    hurt() { this.play('hurt', 0.3, () => this.tone(300, 0.2, 'square', 0.05, 120)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
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
      phase: 'day', // 'night' | 'day' | 'results'
      night: 1,
      t: 0,
      barricade: BARRICADE_MAX,
      hp: PLAYER_MAX,
      guns: WEAPONS.map((w, i) => ({ owned: i === 0, mag: w.mag, reserve: i === 0 ? Infinity : 0 })),
      gun: 0,
      cd: 0,
      reloadT: 0,
      heat: 0,
      recoil: 0,
      flash: 0,
      survivors: [],
      pity: 0,
      zombies: [],
      spawns: [],
      tracers: [],
      parts: [],
      splats: [],
      texts: [],
      shake: 0,
      stats: { kills: 0, headshots: 0, shots: 0, hits: 0 },
      nightStats: null,
      plan: { repair: 4, scavenge: 4, search: 4 },
      results: [],
      nextNightMsg: 0,
    };
    // The first day is short on planning: start straight into night 1.
    startNight();
  }

  // ---------------------------------------------------------------------------
  // Nights
  // ---------------------------------------------------------------------------

  function buildWave(n) {
    const count = 14 + n * 8;
    const weights = [
      ['walker', 10],
      ['runner', n >= 2 ? 2 + n * 0.6 : 0],
      ['crawler', n >= 3 ? 1.5 + n * 0.3 : 0],
      ['brute', n >= 4 ? 0.4 + n * 0.15 : 0],
    ];
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
    return list.sort((a, b) => a.t - b.t);
  }

  function startNight() {
    state.phase = 'night';
    state.t = 0;
    state.spawns = buildWave(state.night);
    state.nightTotal = state.spawns.length;
    state.nightStats = { kills: 0, headshots: 0, barricade: state.barricade };
    state.nextNightMsg = 3;
    for (const s of state.survivors) s.cd = rand(0.5, 1.5);
  }

  function spawnZombie(type) {
    const z = ZOMBIES[type];
    const scale = 1 + 0.1 * (state.night - 1);
    const y = rand(FIELD_TOP, FIELD_BOT);
    state.zombies.push({
      type, y,
      x: W + rand(20, 60),
      hp: z.hp * scale,
      maxHp: z.hp * scale,
      speed: z.speed * rand(0.85, 1.15),
      cd: 0,
      flash: 0,
      walk: rand(0, 6),
      attack: 0,
      shirt: pick(SHIRTS),
      skin: pick(['#7d9a6a', '#8ea37a', '#6f8b61', '#94a38a']),
      dead: false,
    });
    if (Math.random() < 0.3) Sound.groan();
  }

  // Hitboxes in world coordinates; zombies further down the screen are closer and bigger.
  function geom(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    if (z.type === 'crawler') {
      return {
        s,
        body: [z.x - (t.w * s) / 2, z.y - t.h * s, z.x + (t.w * s) / 2, z.y],
        head: { x: z.x - (t.w * s) / 2 - 5 * s, y: z.y - 11 * s, r: 6.5 * s },
      };
    }
    const r = (z.type === 'brute' ? 10 : 7.5) * s;
    return {
      s,
      body: [z.x - (t.w * s) / 2, z.y - t.h * s, z.x + (t.w * s) / 2, z.y],
      head: { x: z.x - 3 * s, y: z.y - t.h * s - r + 1, r },
    };
  }

  function updateZombies(dt) {
    for (const z of state.zombies) {
      const t = ZOMBIES[z.type];
      z.flash -= dt;
      z.cd -= dt;
      z.attack -= dt;
      const s = depth(z.y);
      const stopX = state.barricade > 0 ? BARRICADE_X + 16 + (t.w * s) / 2 : PLAYER.x + 26 + (t.w * s) / 2;
      if (z.x > stopX) {
        z.x = Math.max(stopX, z.x - z.speed * dt);
        z.walk += dt * z.speed * 0.12;
        z.moving = true;
      } else {
        z.moving = false;
        if (z.cd <= 0) {
          z.cd = t.rate * rand(0.9, 1.1);
          z.attack = 0.3;
          if (state.barricade > 0) {
            state.barricade = Math.max(0, state.barricade - t.dmg);
            burst(BARRICADE_X + 12, z.y - 20 * s, '#a16207', 4, 80);
            Sound.knock();
            if (state.barricade === 0) {
              addText(BARRICADE_X, FIELD_TOP - 40, 'The barricade is down!', '#f87171', 2);
              state.shake = 8;
            }
          } else {
            state.hp = Math.max(0, state.hp - t.dmg * 0.5);
            state.shake = Math.max(state.shake, 5);
            Sound.hurt();
            if (state.hp <= 0) gameOver();
          }
        }
      }
    }
    state.zombies = state.zombies.filter((z) => !z.dead);
  }

  function hurtZombie(z, dmg, head, hx, hy, fromPlayer) {
    if (z.dead) return;
    z.hp -= dmg;
    z.flash = 0.08;
    if (z.type !== 'brute') z.x += Math.min(6, dmg * 0.08);
    blood(hx, hy, head ? 8 : 4);
    if (fromPlayer) {
      if (head) Sound.headshot();
      else Sound.hit();
    }
    if (z.hp > 0) return;
    z.dead = true;
    state.stats.kills++;
    state.nightStats.kills++;
    if (head) {
      state.stats.headshots++;
      state.nightStats.headshots++;
      if (fromPlayer) addText(hx, hy - 12, 'HEADSHOT', '#fde047', 0.8);
      blood(hx, hy, 16);
    }
    blood(z.x, z.y - 20 * depth(z.y), 10);
    state.splats.push({ x: z.x + rand(-6, 6), y: z.y + rand(-2, 2), r: rand(8, 16) * depth(z.y) });
    if (state.splats.length > 160) state.splats.shift();
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

  function muzzle() {
    const ang = aimAngle();
    const w = WEAPONS[state.gun];
    const sx = PLAYER.x + 4;
    const sy = PLAYER.y - 38;
    return { x: sx + Math.cos(ang) * (10 + w.len), y: sy + Math.sin(ang) * (10 + w.len), ang };
  }

  function aimAngle() {
    const sx = PLAYER.x + 4;
    const sy = PLAYER.y - 38;
    return clamp(Math.atan2(input.my - sy, Math.max(20, input.mx - sx)), -1.1, 1.1);
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
        hurtZombie(h.z, dmg * (h.head ? HEADSHOT : 1), h.head, h.x, h.y, true);
        dmg *= 0.8;
        end = h;
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
    state.shake = Math.max(state.shake, w.pellets > 1 || w.pierce > 1 ? 3 : 1);
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
      const ox = s.x + 14;
      const oy = s.y - 30;
      const aimHead = Math.random() < 0.2;
      const tx = aimHead ? g.head.x : target.x;
      const ty = aimHead ? g.head.y : target.y - (g.body[3] - g.body[1]) / 2;
      s.aim = Math.atan2(ty - oy, tx - ox);
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
    if (g.mag === 0 && g.reserve === 0 && !AUTOPLAY) {
      // Out of ammo for this gun: fall back to the pistol.
      if (state.cd <= -0.4) switchGun(0);
    }

    updateSurvivors(dt);
    updateZombies(dt);
    if (Math.random() < dt * 0.15 * Math.min(4, state.zombies.length)) Sound.groan();

    if (state.mode === 'playing' && !state.spawns.length && !state.zombies.length) endNight();
  }

  function endNight() {
    const n = state.nightStats;
    const lost = n.barricade - state.barricade;
    state.results = [
      `Night ${state.night} survived.`,
      `${n.kills} zombies killed, ${n.headshots} with headshots.`,
      lost > 0 ? `The barricade took ${lost} damage.` : 'The barricade held without a scratch.',
    ];
    Sound.dawn();
    if (state.night >= NIGHTS) {
      finish(true);
      return;
    }
    state.night++;
    state.phase = 'day';
    state.hp = Math.min(PLAYER_MAX, state.hp + 40);
    state.plan = defaultPlan();
    state.splats = state.splats.slice(-40);
    if (AUTOPLAY) spendDay();
  }

  function defaultPlan() {
    const need = Math.ceil((BARRICADE_MAX - state.barricade) / repairPerHour());
    const repair = clamp(need, 0, 8);
    const rest = DAY_HOURS - repair;
    const search = state.survivors.length < MAX_SURVIVORS ? Math.floor(rest / 2) : 0;
    return { repair, scavenge: rest - search, search };
  }

  // Resolve the day's plan and list what happened.
  function spendDay() {
    const p = state.plan;
    const found = [];
    if (p.repair) {
      const before = state.barricade;
      state.barricade = Math.min(BARRICADE_MAX, state.barricade + p.repair * repairPerHour());
      found.push(`Repairs restored ${state.barricade - before} barricade (${state.barricade}/${BARRICADE_MAX}).`);
    }
    const ammo = {};
    let newGun = null;
    for (let h = 0; h < p.scavenge; h++) {
      const next = state.guns.findIndex((g) => !g.owned);
      if (next >= 0 && Math.random() < 0.12 + state.pity) {
        state.guns[next].owned = true;
        state.guns[next].mag = WEAPONS[next].mag;
        state.guns[next].reserve = WEAPONS[next].find;
        state.pity = 0;
        newGun = WEAPONS[next].name;
        found.push(`Found ${/^(SMG|[AEIOU])/.test(WEAPONS[next].name) ? 'an' : 'a'} ${WEAPONS[next].name}!`);
        continue;
      }
      state.pity += 0.05;
      const owned = state.guns.map((g, i) => i).filter((i) => i > 0 && state.guns[i].owned);
      if (owned.length && Math.random() < 0.9) {
        const i = pick(owned);
        const amount = Math.ceil(WEAPONS[i].find * 0.5);
        state.guns[i].reserve += amount;
        ammo[i] = (ammo[i] || 0) + amount;
      }
    }
    for (const [i, amount] of Object.entries(ammo)) found.push(`Found ${amount} ${WEAPONS[i].short} ammo.`);
    if (p.scavenge && !newGun && !Object.keys(ammo).length) found.push('Scavenging turned up nothing useful.');
    let joined = 0;
    for (let h = 0; h < p.search && state.survivors.length < MAX_SURVIVORS; h++) {
      if (Math.random() < 0.09) {
        addSurvivor();
        joined++;
      }
    }
    if (joined) found.push(`${joined} survivor${joined > 1 ? 's' : ''} joined you.`);
    else if (p.search) found.push('No survivors found today.');
    if (newGun || joined) Sound.find();
    state.results = found;
    state.phase = 'results';
    if (AUTOPLAY) startNight();
  }

  function addSurvivor() {
    const k = state.survivors.length;
    state.survivors.push({
      x: 132 + (k % 2) * 40,
      y: FIELD_TOP + 22 + k * 30,
      cd: 1,
      flash: 0,
      aim: 0,
      shirt: pick(['#1d4ed8', '#0f766e', '#a16207', '#9d174d']),
    });
  }

  function gameOver() {
    finish(false);
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

  // Autoplay: a rough stand-in for a human. It picks the zombie closest to the
  // barricade, reacts after a short delay, moves the mouse at a limited speed
  // with some wobble, and only fires once the crosshair is roughly on target.
  const bot = { target: null, react: 0, ox: 0, oy: 0 };

  function autoAim(dt) {
    // Save the big guns for when zombies are close or numerous.
    const owned = state.guns.map((g, i) => i).filter((i) => state.guns[i].owned && state.guns[i].mag + state.guns[i].reserve > 0);
    const nearest = Math.min(...state.zombies.map((z) => z.x), W);
    const danger = nearest < 480 || state.zombies.length > 10;
    const want = danger ? owned[owned.length - 1] : 0;
    if (want !== state.gun && state.reloadT <= 0) switchGun(want);
    if (!bot.target || bot.target.dead || !state.zombies.includes(bot.target)) {
      bot.target = state.zombies.filter((z) => !z.dead && z.x < W - 20).sort((a, b) => a.x - b.x)[0] || null;
      bot.react = rand(0.2, 0.35);
      bot.ox = rand(-AIM_ERROR, AIM_ERROR);
      bot.oy = rand(-AIM_ERROR, AIM_ERROR) + AIM_ERROR * 0.5;
    }
    input.down = false;
    if (!bot.target) return;
    bot.react -= dt;
    if (bot.react > 0) return;
    const g = geom(bot.target);
    const tx = g.head.x + bot.ox;
    const ty = g.head.y + bot.oy;
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
      // Wobble drifts a little between shots.
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
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; }
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    if (state.parts.length > 700) state.parts.splice(0, state.parts.length - 700);
    for (const t of state.tracers) t.life -= dt;
    state.tracers = state.tracers.filter((t) => t.life > 0);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 25 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    state.shake = Math.max(0, state.shake - dt * 25);
    for (const s of state.survivors) s.flash -= dt;
    state.nextNightMsg -= dt;
  }

  // ---------------------------------------------------------------------------
  // HUD and screen buttons (all hit-tested in canvas coordinates)
  // ---------------------------------------------------------------------------

  const SYS = { x0: 868, y: 10, size: 36, gap: 6 };
  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II', tip: 'Pause (P)' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪', tip: 'Sound (M)' },
      { id: 'full', label: '⛶', tip: 'Fullscreen (F)' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  function gunSlots() {
    return WEAPONS.map((w, i) => ({ id: `gun${i}`, i, x: 452 + i * 80, y: 8, w: 74, h: 40 }));
  }

  const PANEL = { x: 250, y: 110, w: 500, h: 330 };

  function dayButtons() {
    const rows = ['repair', 'scavenge', 'search'];
    const btns = [];
    rows.forEach((key, r) => {
      const y = PANEL.y + 92 + r * 58;
      btns.push({ id: `minus:${key}`, x: PANEL.x + 330, y, w: 34, h: 34, label: '−' });
      btns.push({ id: `plus:${key}`, x: PANEL.x + 430, y, w: 34, h: 34, label: '+' });
    });
    btns.push({ id: 'spend', x: PANEL.x + PANEL.w / 2 - 110, y: PANEL.y + PANEL.h - 58, w: 220, h: 40, label: 'Spend the day' });
    return btns;
  }

  function resultButtons() {
    return [{ id: 'night', x: PANEL.x + PANEL.w / 2 - 110, y: PANEL.y + PANEL.h - 58, w: 220, h: 40, label: `Face night ${state.night}` }];
  }

  function screenButtons() {
    if (!state || state.mode !== 'playing') return [];
    if (state.phase === 'day') return dayButtons();
    if (state.phase === 'results') return resultButtons();
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
    if (op === 'plus' && planUsed() < DAY_HOURS) {
      if (key === 'search' && state.survivors.length >= MAX_SURVIVORS) return;
      state.plan[key]++;
      Sound.click();
    } else if (op === 'minus' && state.plan[key] > 0) {
      state.plan[key]--;
      Sound.click();
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

  function outlined(text, x, y, font, color) {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const night = !state || state.phase === 'night';
    ctx.save();
    if (state && state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    drawBackground(night);
    if (state) {
      for (const sp of state.splats) {
        ctx.fillStyle = 'rgba(69, 10, 10, 0.55)';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBarricade();
      // Draw back to front so closer figures overlap further ones.
      const actors = [
        ...state.zombies.map((z) => ({ y: z.y, draw: () => drawZombie(z) })),
        ...state.survivors.map((sv) => ({ y: sv.y, draw: () => drawSurvivor(sv) })),
        { y: PLAYER.y, draw: drawPlayer },
      ].sort((a, b) => a.y - b.y);
      actors.forEach((a) => a.draw());
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
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const t of state.texts) {
        ctx.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
        outlined(t.text, t.x, t.y, 'bold 13px system-ui, sans-serif', t.color);
      }
      ctx.globalAlpha = 1;
      if (night) {
        // Darken the edges for a night-time feel.
        const v = ctx.createRadialGradient(W * 0.35, H * 0.7, 150, W * 0.5, H * 0.6, 700);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();
    if (!state) return;
    drawHud();
    if (state.mode === 'playing' || state.mode === 'paused') {
      if (state.phase === 'day') drawDayPanel();
      else if (state.phase === 'results') drawResultsPanel();
      else if (state.nextNightMsg > 0) {
        ctx.globalAlpha = clamp(state.nextNightMsg, 0, 1);
        ctx.textAlign = 'center';
        outlined(`Night ${state.night}`, W / 2, 170, 'bold 44px system-ui, sans-serif', '#fef3c7');
        outlined(state.night === 1 ? 'Aim with the mouse, click to shoot, R to reload' : `${state.nightTotal} zombies are coming`,
          W / 2, 200, '600 15px system-ui, sans-serif', '#e7e5e4');
        ctx.globalAlpha = 1;
      }
    }
    drawCursor();
  }

  function drawBackground(night) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD_TOP);
    if (night) {
      g.addColorStop(0, '#070b16');
      g.addColorStop(1, '#1e293b');
    } else {
      g.addColorStop(0, '#93c5fd');
      g.addColorStop(1, '#fde68a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // Moon or sun.
    ctx.fillStyle = night ? 'rgba(254, 243, 199, 0.85)' : 'rgba(255, 251, 235, 0.9)';
    ctx.beginPath();
    ctx.arc(780, 110, night ? 26 : 34, 0, Math.PI * 2);
    ctx.fill();

    // Ruined skyline.
    ctx.fillStyle = night ? '#111827' : '#9ca3af';
    const blocks = [[330, 90], [380, 140], [440, 70], [500, 120], [560, 160], [640, 95], [700, 130], [760, 80], [830, 150], [900, 110], [960, 70]];
    for (const [x, h] of blocks) {
      ctx.fillRect(x, FIELD_TOP - 20 - h, 50, h);
      ctx.fillRect(x + 8, FIELD_TOP - 30 - h, 12, 12);
    }
    ctx.fillStyle = night ? 'rgba(250, 204, 21, 0.25)' : 'rgba(0,0,0,0.12)';
    for (const [x, h] of blocks) {
      for (let wy = FIELD_TOP - h; wy < FIELD_TOP - 30; wy += 22) ctx.fillRect(x + 10, wy, 6, 8);
    }

    // Ground with a road.
    const gg = ctx.createLinearGradient(0, FIELD_TOP - 20, 0, H);
    gg.addColorStop(0, night ? '#292524' : '#a8a29e');
    gg.addColorStop(1, night ? '#1c1917' : '#78716c');
    ctx.fillStyle = gg;
    ctx.fillRect(-20, FIELD_TOP - 20, W + 40, H);
    ctx.fillStyle = night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)';
    for (let x = 280; x < W; x += 70) ctx.fillRect(x, (FIELD_TOP + FIELD_BOT) / 2 - 2, 36, 4);
  }

  function drawBarricade() {
    const frac = state.barricade / BARRICADE_MAX;
    const x = BARRICADE_X;
    const top = FIELD_TOP - 40;
    const bottom = FIELD_BOT + 8;
    // Posts.
    ctx.fillStyle = '#3f2a14';
    ctx.fillRect(x, top, 8, bottom - top);
    ctx.fillRect(x + 20, top + 6, 8, bottom - top - 6);
    // Planks disappear as the barricade takes damage.
    const planks = 14;
    const shown = Math.ceil(planks * frac);
    for (let k = 0; k < planks; k++) {
      if (k >= shown) continue;
      const y = top + 6 + k * ((bottom - top - 12) / planks);
      ctx.save();
      ctx.translate(x + 14, y);
      ctx.rotate(((k * 37) % 7 - 3) * 0.03);
      ctx.fillStyle = k % 3 === 0 ? '#92400e' : k % 3 === 1 ? '#a16207' : '#78350f';
      ctx.fillRect(-18, -5, 36, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-18, 3, 36, 2);
      ctx.restore();
    }
    if (state.barricade <= 0) {
      ctx.fillStyle = '#44403c';
      ctx.fillRect(x - 10, bottom - 14, 50, 10);
    }
  }

  function drawZombie(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const white = z.flash > 0;
    const skin = white ? '#fff' : z.skin;
    const shirt = white ? '#fff' : z.shirt;
    const sway = z.moving ? Math.sin(z.walk) : 0;
    const lunge = z.attack > 0 ? Math.sin((z.attack / 0.3) * Math.PI) * 6 : 0;

    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, t.w * 0.7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (z.type === 'crawler') {
      ctx.fillStyle = shirt;
      ctx.fillRect(-t.w / 2, -t.h, t.w, t.h - 4);
      ctx.strokeStyle = skin;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-t.w / 2 + 4, -8);
      ctx.lineTo(-t.w / 2 - 10 - lunge + sway * 3, -2);
      ctx.moveTo(-t.w / 2 + 10, -8);
      ctx.lineTo(-t.w / 2 - 2 - sway * 3, 0);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(-t.w / 2 - 5, -11, 6.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const bulk = z.type === 'brute' ? 1.4 : 1;
      // Legs.
      ctx.strokeStyle = white ? '#fff' : '#292524';
      ctx.lineWidth = 4 * bulk;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -t.h * 0.45);
      ctx.lineTo(sway * 6, 0);
      ctx.moveTo(0, -t.h * 0.45);
      ctx.lineTo(-sway * 6, 0);
      ctx.stroke();
      // Torso, leaning towards the barricade.
      ctx.save();
      ctx.translate(0, -t.h * 0.45);
      ctx.rotate(-0.12 - (z.type === 'runner' ? 0.15 : 0));
      ctx.fillStyle = shirt;
      ctx.fillRect(-t.w / 2, -t.h * 0.55, t.w, t.h * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-t.w / 2 + 3, -t.h * 0.3, 5, 6);
      // Arms reaching forward.
      ctx.strokeStyle = skin;
      ctx.lineWidth = 3.5 * bulk;
      ctx.beginPath();
      ctx.moveTo(-2, -t.h * 0.48);
      ctx.lineTo(-t.w / 2 - 14 - lunge, -t.h * 0.44 + sway * 2);
      ctx.moveTo(2, -t.h * 0.45);
      ctx.lineTo(-t.w / 2 - 10 - lunge, -t.h * 0.36 - sway * 2);
      ctx.stroke();
      ctx.restore();
      // Head.
      const r = z.type === 'brute' ? 10 : 7.5;
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(-3, -t.h - r + 1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#fef08a';
      ctx.fillRect(-3 - r * 0.6, -t.h - r - 1, 2.5, 2.5);
    }
    ctx.restore();

    if (z.hp < z.maxHp) {
      const g = geom(z);
      const bw = 22 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(z.x - bw / 2, g.head.y - g.head.r - 8, bw, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(z.x - bw / 2, g.head.y - g.head.r - 8, bw * clamp(z.hp / z.maxHp, 0, 1), 3);
    }
  }

  function drawPerson(x, y, shirt, aim, gunLen, flash, recoil) {
    // Legs.
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x - 5, y);
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x + 5, y);
    ctx.stroke();
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 7, y - 42, 14, 24);
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath();
    ctx.arc(x + 1, y - 49, 7, 0, Math.PI * 2);
    ctx.fill();
    // Arms and gun, rotated towards the aim point.
    ctx.save();
    ctx.translate(x + 4 - recoil * 3 * Math.cos(aim), y - 38 - recoil * 3 * Math.sin(aim));
    ctx.rotate(aim);
    ctx.strokeStyle = '#f5d0a9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(12, 1);
    ctx.stroke();
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(8, -3, gunLen, 5);
    ctx.fillRect(10, 1, 4, 6);
    if (flash > 0) {
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(10 + gunLen, -6);
      ctx.lineTo(24 + gunLen, 0);
      ctx.lineTo(10 + gunLen, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    // Crate the player stands on.
    ctx.fillStyle = '#78350f';
    ctx.fillRect(PLAYER.x - 22, PLAYER.y, 44, 40);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.strokeRect(PLAYER.x - 22, PLAYER.y, 44, 40);
    ctx.beginPath();
    ctx.moveTo(PLAYER.x - 22, PLAYER.y);
    ctx.lineTo(PLAYER.x + 22, PLAYER.y + 40);
    ctx.stroke();
    drawPerson(PLAYER.x, PLAYER.y, '#2563eb', aimAngle(), WEAPONS[state.gun].len, state.flash, state.recoil);
  }

  function drawSurvivor(sv) {
    drawPerson(sv.x, sv.y, sv.shirt, sv.aim || 0, 14, sv.flash, 0);
  }

  // --- HUD ---------------------------------------------------------------------

  function drawHud() {
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(12,10,9,0.72)';
    ctx.fillRect(0, 0, W, BAR);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const label = state.phase === 'night' ? `Night ${state.night}` : `Day ${state.night}`;
    ctx.fillText(label, 14, 25);
    const labelW = ctx.measureText(label).width;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`of ${NIGHTS}`, 20 + labelW, 25);
    if (state.phase === 'night') {
      const left = state.spawns.length + state.zombies.length;
      ctx.fillStyle = '#d6d3d1';
      ctx.fillText(`${left} zombie${left === 1 ? '' : 's'} left`, 14, 44);
    } else {
      ctx.fillStyle = '#d6d3d1';
      ctx.fillText(`${state.stats.kills} kills so far`, 14, 44);
    }

    bar(150, 12, 150, 'Barricade', state.barricade, BARRICADE_MAX, '#d97706');
    bar(150, 34, 150, 'You', state.hp, PLAYER_MAX, '#22c55e');
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#d6d3d1';
    ctx.fillText(`Survivors ${state.survivors.length}/${MAX_SURVIVORS}`, 322, 25);
    ctx.fillText(`Headshots ${state.stats.headshots}`, 322, 44);

    for (const slot of gunSlots()) {
      const g = state.guns[slot.i];
      const w = WEAPONS[slot.i];
      const active = slot.i === state.gun;
      const hot = hover && hover.id === slot.id;
      ctx.globalAlpha = g.owned ? 1 : 0.35;
      ctx.fillStyle = active ? '#fef3c7' : hot ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      roundRect(slot.x, slot.y, slot.w, slot.h, 7);
      ctx.fill();
      ctx.fillStyle = active ? '#1c1917' : '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(g.owned ? w.short : '???', slot.x + 7, slot.y + 16);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = active ? '#44403c' : '#d6d3d1';
      if (g.owned) ctx.fillText(g.reserve === Infinity ? `${g.mag} / ∞` : `${g.mag} / ${g.reserve}`, slot.x + 7, slot.y + 32);
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
      roundRect(b.x, b.y, b.w, b.h, 8);
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
    roundRect(x, y, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(x, y, Math.max(14, w * clamp(v / max, 0, 1)), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} ${Math.ceil(v)}/${max}`, x + w / 2, y + 11);
  }

  function panel(title, subtitle) {
    ctx.fillStyle = 'rgba(12,10,9,0.86)';
    roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(title, PANEL.x + PANEL.w / 2, PANEL.y + 40);
    ctx.fillStyle = '#d6d3d1';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(subtitle, PANEL.x + PANEL.w / 2, PANEL.y + 62);
  }

  function drawButton(b, hover, primary) {
    const hot = hover && hover.id === b.id;
    const disabled = b.disabled;
    ctx.globalAlpha = disabled ? 0.4 : 1;
    ctx.fillStyle = primary ? (hot ? '#f59e0b' : '#d97706') : hot ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
    roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${primary ? 15 : 18}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function drawDayPanel() {
    const hover = hitTest(input.mx, input.my);
    const left = DAY_HOURS - planUsed();
    panel(`Day ${state.night}`, `${DAY_HOURS} hours until dark. ${left ? `${left} hour${left > 1 ? 's' : ''} unassigned.` : 'Every hour is assigned.'}`);
    const p = state.plan;
    const rows = [
      ['repair', 'Repair the barricade', `+${p.repair * repairPerHour()} barricade (${repairPerHour()} per hour)`],
      ['scavenge', 'Scavenge', state.guns.every((g) => g.owned) ? 'Ammo for your guns' : 'Weapons and ammo'],
      ['search', 'Search for survivors',
        state.survivors.length >= MAX_SURVIVORS ? 'Your group is full' : 'Survivors fight at night and help repair'],
    ];
    rows.forEach(([key, name, note], r) => {
      const y = PANEL.y + 92 + r * 58;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(name, PANEL.x + 30, y + 15);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(note, PANEL.x + 30, y + 32);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p[key]}h`, PANEL.x + 397, y + 24);
    });
    for (const b of dayButtons()) drawButton(b, hover, b.id === 'spend');
  }

  function drawResultsPanel() {
    const hover = hitTest(input.mx, input.my);
    panel('Dusk', 'Here is how the day went.');
    ctx.textAlign = 'left';
    state.results.forEach((line, k) => {
      const big = line.endsWith('!');
      ctx.fillStyle = big || line.includes('joined') ? '#fde047' : '#e7e5e4';
      ctx.font = big ? 'bold 15px system-ui, sans-serif' : '14px system-ui, sans-serif';
      ctx.fillText(line, PANEL.x + 40, PANEL.y + 100 + k * 26);
    });
    for (const b of resultButtons()) drawButton(b, hover, true);
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
          <p>Hold the barricade through the night. Prepare during the day. Survive ${NIGHTS} nights.</p>
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
      const record = !prev || (state.won ? NIGHTS : state.night) > prev.night
        || ((state.won ? NIGHTS : state.night) === prev.night && s.kills > prev.kills);
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
    if (!state || state.mode !== 'playing') return;
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
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
