'use strict';

// Nameless War: a lane battle across four ages.
// Everything, including the HUD and buttons, is drawn on one canvas;
// there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 500;
  const BAR = 80; // height of the HUD bar across the top
  const GROUND = 440;
  const BASE_W = 80;
  const BASE_H = 110;
  const LANE_L = 20 + BASE_W; // front of the player's base
  const LANE_R = W - 20 - BASE_W; // front of the enemy base

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');

  // Base stats for the three unit slots; each age multiplies them.
  const TYPES = [
    { cost: 15, hp: 60, dmg: 12, range: 0, rate: 1.0, speed: 42, train: 1.0, w: 16, h: 30, xp: 30 },
    { cost: 25, hp: 40, dmg: 9, range: 160, rate: 1.3, speed: 40, train: 1.4, w: 14, h: 28, xp: 45 },
    { cost: 100, hp: 280, dmg: 32, range: 0, rate: 1.6, speed: 30, train: 3.2, w: 30, h: 40, xp: 160 },
  ];

  const AGES = [
    {
      name: 'Stone Age', mult: 1, costMult: 1, baseHp: 1000, xpNext: 1200,
      units: ['Clubber', 'Slinger', 'Tusk Rider'], turret: 'Rock Tosser', special: 'Rockfall',
      sky: ['#fde7c7', '#f2b07e'], hills: '#c89f74', ground: '#7d5f3f', metal: '#6b4a2b', glow: '#d97706',
    },
    {
      name: 'Iron Age', mult: 2.5, costMult: 2.3, baseHp: 1800, xpNext: 4500,
      units: ['Swordsman', 'Archer', 'Knight'], turret: 'Ballista', special: 'Arrow Storm',
      sky: ['#dbeafe', '#93c5fd'], hills: '#7fa46a', ground: '#4d6b3a', metal: '#9ca3af', glow: '#e5e7eb',
    },
    {
      name: 'Powder Age', mult: 6, costMult: 5.5, baseHp: 3000, xpNext: 14000,
      units: ['Rifleman', 'Grenadier', 'Cannon Cart'], turret: 'Cannon', special: 'Barrage',
      sky: ['#e7e5e4', '#a8a29e'], hills: '#78716c', ground: '#57534e', metal: '#374151', glow: '#f97316',
    },
    {
      name: 'Future Age', mult: 14, costMult: 12, baseHp: 4800, xpNext: Infinity,
      units: ['Trooper', 'Laser Gunner', 'Mech'], turret: 'Laser Turret', special: 'Orbital Strike',
      sky: ['#1e1b4b', '#4c1d95'], hills: '#312e81', ground: '#1f2937', metal: '#94a3b8', glow: '#22d3ee',
    },
  ];

  const TURRET = { cost: 120, dmg: 11, rate: 1.1 };
  // Turret slots on each base, bottom to top. Higher slots reach further.
  const SLOTS = [
    { name: 'Low', rise: 52, range: 250 },
    { name: 'Middle', rise: 88, range: 290 },
    { name: 'Roof', rise: BASE_H + 10, range: 340 },
  ];
  const SLOT_UNLOCK = [0, 200, 600]; // cost of opening your 1st, 2nd and 3rd slot
  const SPECIAL = { cooldown: 45, dmg: 40, count: 24, duration: 2.4, radius: 34 };
  const MAX_QUEUE = 5;
  const KILL_GOLD = 0.8; // gold earned per kill, as a multiple of the victim's cost
  const UPGRADE = { cost: 250, bonus: 0.1 }; // army upgrade: +10% HP and damage per level, cost rises linearly

  // Bonuses for the computer player.
  const DIFFICULTY = {
    easy: { gold: 0.75, xp: 1.5, think: 1.4, special: 0 },
    normal: { gold: 1.0, xp: 4, think: 1.0, special: 6 },
    hard: { gold: 1.4, xp: 8, think: 0.7, special: 4 },
  };

  const SIDE_COLORS = [
    { body: '#2563eb', dark: '#1e3a8a', light: '#93c5fd' },
    { body: '#dc2626', dark: '#7f1d1d', light: '#fca5a5' },
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const front = (side) => (side.i === 0 ? LANE_L : LANE_R);
  const baseCenter = (side) => (side.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2);
  const unitCost = (side, t) => Math.round(TYPES[t].cost * AGES[side.age].costMult);
  const turretCost = (side) => Math.round(TURRET.cost * AGES[side.age].costMult);
  const unlockCost = (side) => SLOT_UNLOCK[side.open.filter(Boolean).length] ?? Infinity;
  const upgradeCost = (side) => UPGRADE.cost * (side.level + 1);
  const power = (side) => 1 + side.level * UPGRADE.bonus;
  const canEvolve = (side) => side.age < AGES.length - 1 && side.xp >= AGES[side.age].xpNext;
  const aiBonus = (side) => (side.i === 1 ? DIFFICULTY[difficulty] : null);

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
      fn(this.ctx, now);
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

    hit() { this.play('hit', 0.05, () => this.noise(0.07, 0.15, 2200)); },
    shoot() { this.play('shoot', 0.06, () => this.tone(760, 0.06, 'square', 0.03, 380)); },
    death() { this.play('death', 0.08, () => this.tone(260, 0.2, 'sawtooth', 0.05, 70)); },
    boom() { this.play('boom', 0.07, () => this.noise(0.4, 0.3, 500)); },
    base() { this.play('base', 0.15, () => this.noise(0.25, 0.25, 300)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
    evolve() {
      this.play('evolve', 0.5, () => {
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, null, i * 0.09));
      });
    },
    special() { this.play('special', 0.5, () => this.tone(180, 0.6, 'sawtooth', 0.06, 900)); },
    win() {
      this.play('end', 1, () => {
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.09, null, i * 0.14));
      });
    },
    lose() {
      this.play('end', 1, () => {
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.05, null, i * 0.18));
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let difficulty = 'normal';
  let state = null;
  // Pointer and turret-placement state for the player's HUD.
  const ui = { mode: null, mx: -1, my: -1 };

  function newSide(i, ai) {
    return {
      i, ai,
      dir: i === 0 ? 1 : -1,
      age: 0,
      gold: 175,
      xp: 0,
      level: 0,
      hp: AGES[0].baseHp,
      maxHp: AGES[0].baseHp,
      queue: [],
      trainT: 0,
      turrets: [null, null, null],
      open: [true, false, false],
      specialCd: 20,
      thinkT: 1,
      hitFlash: 0,
      kills: 0,
    };
  }

  function newGame() {
    state = {
      mode: 'playing',
      t: 0,
      sides: [newSide(0, AUTOPLAY), newSide(1, true)],
      units: [],
      shots: [],
      drops: [],
      parts: [],
      texts: [],
      shake: 0,
      winner: null,
    };
    ui.mode = null;
  }

  // ---------------------------------------------------------------------------
  // Actions (used by both the player and the AI)
  // ---------------------------------------------------------------------------

  function deny(side) {
    if (!side.ai) Sound.deny();
    return false;
  }

  function train(side, t) {
    if (state.mode !== 'playing') return false;
    const cost = unitCost(side, t);
    if (side.queue.length >= MAX_QUEUE || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.queue.push({ t, age: side.age });
    if (!side.ai) Sound.click();
    return true;
  }

  // Build a turret in a slot. An occupied slot holding an older-age turret is
  // replaced, with the old turret's refund counted towards the price.
  function buildTurret(side, slot) {
    if (state.mode !== 'playing' || !side.open[slot]) return deny(side);
    const old = side.turrets[slot];
    if (old && old.age >= side.age) return deny(side);
    const refund = old ? Math.round(old.cost * 0.5) : 0;
    const cost = turretCost(side);
    if (side.gold + refund < cost) return deny(side);
    side.gold += refund - cost;
    side.turrets[slot] = { age: side.age, cd: 0.5, cost, aim: side.i === 0 ? 0 : Math.PI };
    const p = turretPos(side, slot);
    burst(p.x, p.y, AGES[side.age].glow, 10, 120);
    if (!side.ai) Sound.click();
    return true;
  }

  function unlockSlot(side, slot) {
    const cost = unlockCost(side);
    if (state.mode !== 'playing' || side.open[slot] || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.open[slot] = true;
    const p = turretPos(side, slot);
    burst(p.x, p.y, '#facc15', 8, 100);
    if (!side.ai) Sound.click();
    return true;
  }

  function sellTurret(side, slot) {
    const tur = side.turrets[slot];
    if (state.mode !== 'playing' || !tur) return deny(side);
    const refund = Math.round(tur.cost * 0.5);
    side.gold += refund;
    side.turrets[slot] = null;
    const p = turretPos(side, slot);
    addText(p.x, p.y - 10, `+${refund}`, '#facc15');
    if (!side.ai) Sound.click();
    return true;
  }

  function castSpecial(side) {
    if (state.mode !== 'playing' || side.specialCd > 0) return deny(side);
    side.specialCd = SPECIAL.cooldown;
    const enemies = state.units.filter((u) => u.side !== side.i);
    const lo = side.i === 0 ? LANE_L + 120 : LANE_L + 10;
    const hi = side.i === 0 ? LANE_R - 10 : LANE_R - 120;
    for (let k = 0; k < SPECIAL.count; k++) {
      let x = rand(lo, hi);
      if (enemies.length && Math.random() < 0.7) {
        x = clamp(enemies[(Math.random() * enemies.length) | 0].x + rand(-40, 40), lo, hi);
      }
      state.drops.push({
        x, y: -30, vy: 0,
        delay: (k / SPECIAL.count) * SPECIAL.duration + rand(0, 0.15),
        side: side.i, age: side.age,
      });
    }
    Sound.special();
    return true;
  }

  function upgrade(side) {
    const cost = upgradeCost(side);
    if (state.mode !== 'playing' || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.level++;
    addText(baseCenter(side), GROUND - BASE_H - 30, `Army Lv ${side.level}`, '#fff', 1.2);
    if (!side.ai) Sound.click();
    return true;
  }

  function evolve(side) {
    if (state.mode !== 'playing' || !canEvolve(side)) return deny(side);
    side.age++;
    const max = AGES[side.age].baseHp;
    side.hp += max - side.maxHp;
    side.maxHp = max;
    const cx = baseCenter(side);
    burst(cx, GROUND - BASE_H / 2, AGES[side.age].glow, 40, 260);
    addText(cx, GROUND - BASE_H - 30, AGES[side.age].name + '!', '#fff', 1.8);
    Sound.evolve();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function spawnClear(side) {
    const x0 = front(side);
    return !state.units.some((u) => u.side === side.i && Math.abs(u.x - x0) < 30);
  }

  function spawn(side, item) {
    const ty = TYPES[item.t];
    const a = AGES[item.age];
    const hp = ty.hp * a.mult * power(side);
    state.units.push({
      side: side.i, dir: side.dir, age: item.age, t: item.t,
      x: front(side) + side.dir * (ty.w / 2 + 1),
      hp, maxHp: hp,
      dmg: ty.dmg * a.mult * power(side),
      range: ty.range,
      rate: ty.rate,
      speed: ty.speed * rand(0.95, 1.05),
      w: ty.w, h: ty.h,
      cost: Math.round(ty.cost * a.costMult),
      xp: ty.xp * a.costMult,
      cd: 0.3, flash: 0, atk: 0,
      walk: rand(0, 6),
      moving: false,
      dead: false,
    });
  }

  function updateTraining(side, dt) {
    if (!side.queue.length) return;
    const item = side.queue[0];
    side.trainT = Math.min(side.trainT + dt, TYPES[item.t].train);
    if (side.trainT >= TYPES[item.t].train && spawnClear(side)) {
      side.queue.shift();
      side.trainT = 0;
      spawn(side, item);
    }
  }

  function turretPos(side, slot) {
    const s = SLOTS[slot];
    if (slot === 2) return { x: baseCenter(side), y: GROUND - s.rise };
    return { x: front(side) + side.dir * 4, y: GROUND - s.rise };
  }

  function updateTurrets(side, dt) {
    side.turrets.forEach((tur, slot) => {
      if (!tur) return;
      tur.cd -= dt;
      let target = null;
      let best = SLOTS[slot].range;
      for (const e of state.units) {
        if (e.side === side.i || e.dead) continue;
        const d = (e.x - front(side)) * side.dir;
        if (d >= -20 && d < best) { best = d; target = e; }
      }
      if (!target) return;
      const p = turretPos(side, slot);
      tur.aim = Math.atan2(GROUND - target.h / 2 - p.y, target.x - p.x);
      if (tur.cd <= 0) {
        tur.cd = TURRET.rate;
        fire(p.x + Math.cos(tur.aim) * 14, p.y + Math.sin(tur.aim) * 14, target, side.i,
          TURRET.dmg * AGES[tur.age].mult * power(side), tur.age, true);
      }
    });
  }

  function updateUnits(dt) {
    const units = state.units;
    for (const u of units) {
      if (u.dead) continue;
      u.cd -= dt;
      u.flash -= dt;
      u.atk -= dt;
      const enemySide = state.sides[1 - u.side];

      let blocked = false;
      for (const o of units) {
        if (o === u || o.dead || o.side !== u.side) continue;
        const d = (o.x - u.x) * u.dir;
        if (d > 0 && d < (o.w + u.w) / 2 + 4) { blocked = true; break; }
      }

      let target = null;
      let gap = Infinity;
      for (const e of units) {
        if (e.dead || e.side === u.side) continue;
        const g = (e.x - u.x) * u.dir - (e.w + u.w) / 2;
        if (g > -e.w && g < gap) { gap = g; target = e; }
      }
      const baseGap = (front(enemySide) - u.x) * u.dir - u.w / 2;
      if (baseGap < gap) { gap = baseGap; target = enemySide; }

      if (gap <= 2) blocked = true;
      const reach = u.range > 0 ? u.range : 8;
      if (target && gap <= reach && u.cd <= 0) {
        u.cd = u.rate * rand(0.9, 1.1);
        u.atk = 0.25;
        if (u.range > 0) {
          fire(u.x + u.dir * u.w / 2, GROUND - u.h * 0.7, target, u.side, u.dmg, u.age, false);
        } else {
          const hx = u.x + u.dir * (u.w / 2 + 2);
          if (target === enemySide) hurtBase(enemySide, u.dmg, u.side);
          else hurtUnit(target, u.dmg, u.side);
          burst(hx, GROUND - u.h * 0.6, '#fff', 4, 90);
          Sound.hit();
        }
      }

      u.moving = !blocked;
      if (!blocked) {
        u.x += u.dir * u.speed * dt;
        u.walk += dt * u.speed * 0.22;
      }
      u.x = clamp(u.x, LANE_L + u.w / 2, LANE_R - u.w / 2);
    }
    state.units = units.filter((u) => !u.dead);
  }

  function aimPoint(target) {
    if (target.i !== undefined) {
      return { x: target.i === 0 ? LANE_L - 12 : LANE_R + 12, y: GROUND - BASE_H * 0.45 };
    }
    return { x: target.x, y: GROUND - target.h * 0.55 };
  }

  function fire(x, y, target, side, dmg, age, turret) {
    const p = aimPoint(target);
    state.shots.push({ x, y, tx: p.x, ty: p.y, target, side, dmg, age, turret, speed: turret ? 480 : 420 });
    Sound.shoot();
  }

  function updateShots(dt) {
    for (const s of state.shots) {
      const alive = s.target.i !== undefined || !s.target.dead;
      if (alive) {
        const p = aimPoint(s.target);
        s.tx = p.x;
        s.ty = p.y;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      const step = s.speed * dt;
      s.ang = Math.atan2(dy, dx);
      if (dist <= step + 4) {
        s.done = true;
        if (!alive) continue;
        if (s.target.i !== undefined) hurtBase(s.target, s.dmg, s.side);
        else hurtUnit(s.target, s.dmg, s.side);
        burst(s.tx, s.ty, AGES[s.age].glow, 4, 80);
      } else {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      }
    }
    state.shots = state.shots.filter((s) => !s.done);
  }

  function updateDrops(dt) {
    for (const d of state.drops) {
      d.delay -= dt;
      if (d.delay > 0) continue;
      d.vy += 1100 * dt;
      d.y += d.vy * dt;
      if (d.y >= GROUND) {
        d.done = true;
        const dmg = SPECIAL.dmg * AGES[d.age].mult;
        for (const u of state.units) {
          if (u.side !== d.side && !u.dead && Math.abs(u.x - d.x) < SPECIAL.radius + u.w / 2) {
            hurtUnit(u, dmg, d.side);
          }
        }
        burst(d.x, GROUND - 4, AGES[d.age].glow, 12, 200);
        burst(d.x, GROUND - 4, '#57534e', 6, 140);
        state.shake = Math.max(state.shake, 4);
        Sound.boom();
      }
    }
    state.drops = state.drops.filter((d) => !d.done);
  }

  function hurtUnit(u, amount, fromSide) {
    if (u.dead) return;
    u.hp -= amount;
    u.flash = 0.1;
    u.x -= u.dir * Math.min(8, (amount / u.maxHp) * 30);
    addText(u.x, GROUND - u.h - 14, Math.round(amount), fromSide === 0 ? '#fde047' : '#fecaca', 0.7);
    if (u.hp > 0) return;

    u.dead = true;
    const killer = state.sides[fromSide];
    const bonus = aiBonus(killer);
    const gold = Math.round(u.cost * KILL_GOLD * (bonus ? bonus.gold : 1));
    killer.gold += gold;
    killer.xp += u.xp;
    killer.kills++;
    if (!killer.ai) addText(u.x, GROUND - u.h - 30, `+${gold}`, '#facc15', 1);
    burst(u.x, GROUND - u.h / 2, SIDE_COLORS[u.side].body, 14, 180);
    burst(u.x, GROUND - u.h / 2, '#7f1d1d', 6, 120);
    Sound.death();
  }

  function hurtBase(side, amount, fromSide) {
    if (state.mode !== 'playing') return;
    side.hp -= amount;
    side.hitFlash = 0.12;
    state.sides[fromSide].xp += amount * 0.05;
    if (side.i === 0) state.shake = Math.max(state.shake, 5);
    Sound.base();
    if (side.hp <= 0) {
      side.hp = 0;
      endGame(1 - side.i);
    }
  }

  function aiThink(side, dt) {
    side.thinkT -= dt;
    if (side.thinkT > 0) return;
    const bonus = aiBonus(side);
    side.thinkT = rand(0.5, 1.2) * (bonus ? bonus.think : 1);

    if (canEvolve(side)) { evolve(side); return; }

    const threats = state.units.filter(
      (u) => u.side !== side.i && Math.abs(u.x - front(side)) < 350,
    ).length;
    // Minimum number of nearby enemies before the AI uses its special (0 = never).
    const specialAt = bonus ? bonus.special : 4;
    if (specialAt && side.specialCd <= 0 && threats >= specialAt) castSpecial(side);

    // Turrets: fill the highest open slot, open more slots later, replace old ones.
    const tc = turretCost(side);
    let empty = -1;
    for (let k = SLOTS.length - 1; k >= 0; k--) {
      if (side.open[k] && !side.turrets[k]) { empty = k; break; }
    }
    if (state.t > 30 && empty >= 0 && side.gold >= tc * 1.5) {
      buildTurret(side, empty);
      return;
    }
    const locked = side.open.indexOf(false);
    if (state.t > 60 && empty < 0 && locked >= 0 && side.gold >= unlockCost(side) * 2 + tc) {
      unlockSlot(side, locked);
      return;
    }
    const old = side.turrets.findIndex((t) => t && t.age < side.age);
    if (old >= 0 && side.gold >= tc * 2.2) {
      buildTurret(side, old);
      return;
    }

    const reserve = unitCost(side, 2) * 2;
    if (side.gold >= upgradeCost(side) + reserve && (side.queue.length >= 3 || Math.random() < 0.3)) {
      upgrade(side);
      return;
    }

    if (side.queue.length >= 3) return;
    let t = Math.random() < 0.5 ? 0 : 1;
    if (side.gold >= unitCost(side, 2) * 1.4 && Math.random() < 0.35) t = 2;
    train(side, t);
  }

  function step(dt) {
    state.t += dt;
    for (const side of state.sides) {
      const bonus = aiBonus(side);
      side.gold += 1.5 * AGES[side.age].costMult * (bonus ? bonus.gold : 1) * dt;
      side.xp += (1 + (bonus ? bonus.xp : 0)) * dt;
      side.specialCd = Math.max(0, side.specialCd - dt);
      side.hitFlash -= dt;
      if (side.ai) aiThink(side, dt);
      updateTraining(side, dt);
      updateTurrets(side, dt);
    }
    updateUnits(dt);
    updateShots(dt);
    updateDrops(dt);
  }

  function endGame(winner) {
    state.mode = 'over';
    state.winner = winner;
    ui.mode = null;
    const loser = state.sides[1 - winner];
    const cx = baseCenter(loser);
    for (let k = 0; k < 5; k++) burst(cx + rand(-30, 30), GROUND - rand(10, BASE_H), '#f97316', 20, 300);
    state.shake = 14;
    if (winner === 0) Sound.win();
    else Sound.lose();
    showOverlay('over');
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
        life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 4),
      });
    }
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
      if (p.y > GROUND) { p.y = GROUND; p.vy *= -0.3; p.vx *= 0.6; }
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    if (state.parts.length > 600) state.parts.splice(0, state.parts.length - 600);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 30 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    state.shake = Math.max(0, state.shake - dt * 25);
  }

  // ---------------------------------------------------------------------------
  // HUD layout: stats on the left, action tiles in the middle, system buttons
  // on the right. Everything is hit-tested in canvas coordinates.
  // ---------------------------------------------------------------------------

  const TILE = { x0: 270, y: 9, w: 62, h: 62, gap: 6 };
  const SYS = { x0: 868, y: 9, size: 36, gap: 6 };

  function hudTiles() {
    const me = state.sides[0];
    const a = AGES[me.age];
    const playing = state.mode === 'playing' && !me.ai;
    const tiles = [0, 1, 2].map((t) => {
      const ty = TYPES[t];
      const cost = unitCost(me, t);
      return {
        id: `unit${t}`, key: String(t + 1), cost: `${cost}`,
        enabled: playing && me.gold >= cost && me.queue.length < MAX_QUEUE,
        icon: (x, y) => drawUnitIcon(x, y, me.age, t),
        tip: [a.units[t], `${cost} gold · trains in ${ty.train}s`,
          `HP ${Math.round(ty.hp * a.mult * power(me))} · DMG ${Math.round(ty.dmg * a.mult * power(me))}`,
          ty.range ? 'Ranged: shoots over your front line' : t === 2 ? 'Heavy melee: slow but tough' : 'Melee: cheap front line'],
      };
    });
    tiles.push({
      id: 'build', key: 'T', cost: `${turretCost(me)}`,
      enabled: playing, active: ui.mode === 'build',
      icon: (x, y) => drawTurretIcon(x, y, me.age),
      tip: [`${a.turret}`, `${turretCost(me)} gold`, 'Click, then pick a slot on your base.',
        'Higher slots reach further. Older turrets can be replaced.'],
    });
    tiles.push({
      id: 'sell', key: 'S', cost: 'Sell',
      enabled: playing && me.turrets.some(Boolean), active: ui.mode === 'sell',
      icon: drawSellIcon,
      tip: ['Sell turret', 'Click, then pick one of your turrets.', 'Refunds 50% of what it cost.'],
    });
    tiles.push({
      id: 'upgrade', key: 'U', cost: `${upgradeCost(me)}`,
      enabled: playing && me.gold >= upgradeCost(me),
      icon: (x, y) => drawUpgradeIcon(x, y, me.level),
      tip: [`Upgrade army (now Lv ${me.level})`, `${upgradeCost(me)} gold`,
        '+10% HP and damage for new units and turrets.'],
    });
    tiles.push({
      id: 'special', key: 'Q', cost: me.specialCd > 0 ? `${Math.ceil(me.specialCd)}s` : 'Ready',
      enabled: playing && me.specialCd <= 0, glow: playing && me.specialCd <= 0,
      cooldown: me.specialCd / SPECIAL.cooldown,
      icon: (x, y) => drawSpecialIcon(x, y, me.age),
      tip: [a.special, 'Rains damage on enemies across the field.', `Recharges in ${SPECIAL.cooldown}s.`],
    });
    const next = AGES[me.age + 1];
    tiles.push({
      id: 'evolve', key: 'E', cost: next ? `${a.xpNext} XP` : 'Max',
      enabled: playing && canEvolve(me), glow: playing && canEvolve(me),
      icon: drawEvolveIcon,
      tip: next
        ? [`Evolve to ${next.name}`, `Needs ${a.xpNext} XP (you have ${Math.floor(me.xp)})`,
          'Unlocks new units and turrets and heals your base.']
        : ['Final age reached', 'Nothing left to unlock.'],
    });
    tiles.forEach((t, k) => {
      t.x = TILE.x0 + k * (TILE.w + TILE.gap);
      t.y = TILE.y;
      t.w = TILE.w;
      t.h = TILE.h;
    });
    return tiles;
  }

  function sysButtons() {
    const paused = state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II', tip: [paused ? 'Resume (P)' : 'Pause (P)'] },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪', tip: [Sound.muted ? 'Sound off (M)' : 'Sound on (M)'] },
      { id: 'full', label: '⛶', tip: ['Fullscreen (F)'] },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  // Slot hotspots on the player's base, shown while placing or selling turrets.
  function slotSpots() {
    const me = state.sides[0];
    return SLOTS.map((s, k) => {
      const p = turretPos(me, k);
      return { slot: k, x: p.x - 16, y: p.y - 16, w: 32, h: 32, cx: p.x, cy: p.y };
    });
  }

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function slotTip(k) {
    const me = state.sides[0];
    const tur = me.turrets[k];
    const s = SLOTS[k];
    if (ui.mode === 'sell') {
      return tur ? [`Sell ${AGES[tur.age].turret}`, `+${Math.round(tur.cost * 0.5)} gold`] : [`${s.name} slot`, 'Empty'];
    }
    if (!me.open[k]) return [`Open ${s.name.toLowerCase()} slot`, `${unlockCost(me)} gold`, `Range ${s.range}`];
    if (!tur) return [`Build ${AGES[me.age].turret}`, `${turretCost(me)} gold`, `${s.name} slot · range ${s.range}`];
    if (tur.age < me.age) {
      return [`Replace with ${AGES[me.age].turret}`, `${turretCost(me) - Math.round(tur.cost * 0.5)} gold after refund`];
    }
    return [`${s.name} slot`, `Has a ${AGES[tur.age].turret}`, 'Already your best turret'];
  }

  function slotAction(k) {
    const me = state.sides[0];
    let ok;
    if (ui.mode === 'sell') ok = sellTurret(me, k);
    else if (!me.open[k]) ok = unlockSlot(me, k);
    else ok = buildTurret(me, k);
    // Stay in build mode after opening a slot so the next click can fill it.
    if (ok && !(ui.mode === 'build' && me.open[k] && !me.turrets[k])) ui.mode = null;
  }

  function activate(id) {
    const me = state && state.sides[0];
    if (!me) return;
    if (id === 'pause') { togglePause(); return; }
    if (id === 'mute') { toggleMute(); return; }
    if (id === 'full') { toggleFullscreen(); return; }
    if (state.mode !== 'playing' || me.ai) return;
    if (id.startsWith('unit')) train(me, Number(id.slice(4)));
    else if (id === 'build' || id === 'sell') {
      ui.mode = ui.mode === id ? null : id;
      Sound.click();
    } else if (id === 'upgrade') upgrade(me);
    else if (id === 'special') castSpecial(me);
    else if (id === 'evolve') evolve(me);
  }

  // What is under the pointer: a tile, a system button or a slot.
  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return { kind: 'sys', item: b };
    if (state.mode === 'menu') return null;
    for (const t of hudTiles()) if (inside(t, x, y)) return { kind: 'tile', item: t };
    if (ui.mode) {
      for (const s of slotSpots()) if (inside(s, x, y)) return { kind: 'slot', item: s };
    }
    return null;
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

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    if (state && state.shake > 0) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }
    const age = state ? AGES[state.sides[0].age] : AGES[0];
    drawBackground(age);
    if (state) {
      state.sides.forEach(drawBase);
      state.units.forEach(drawUnit);
      state.shots.forEach(drawShot);
      state.drops.forEach(drawDrop);
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
    }
    ctx.restore();
    if (state) {
      if (ui.mode) drawSlotPicker();
      drawHud();
    }
  }

  function outlined(text, x, y, font, color) {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground(a) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, a.sky[0]);
    g.addColorStop(1, a.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(820, 150, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = a.hills;
    ctx.globalAlpha = 0.55;
    hills(GROUND - 100, 60, 0.006, 1.3);
    ctx.globalAlpha = 1;
    hills(GROUND - 60, 40, 0.01, 4.1);

    ctx.fillStyle = a.ground;
    ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-20, GROUND, W + 40, 4);
  }

  function hills(y, amp, freq, phase) {
    ctx.beginPath();
    ctx.moveTo(-20, GROUND);
    for (let x = -20; x <= W + 20; x += 20) {
      ctx.lineTo(x, y - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.7 + phase) * amp * 0.3);
    }
    ctx.lineTo(W + 20, GROUND);
    ctx.closePath();
    ctx.fill();
  }

  function drawBase(side) {
    const a = AGES[side.age];
    const c = SIDE_COLORS[side.i];
    const x = side.i === 0 ? 20 : W - 20 - BASE_W;
    const top = GROUND - BASE_H;
    const flash = side.hitFlash > 0;
    const wall = flash ? '#fff' : a.metal;

    ctx.fillStyle = wall;
    if (side.age === 0) {
      // Stone hut: a dome on a low wall.
      ctx.fillRect(x, top + 40, BASE_W, BASE_H - 40);
      ctx.beginPath();
      ctx.ellipse(x + BASE_W / 2, top + 42, BASE_W / 2 + 6, 42, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(x + BASE_W / 2, GROUND, 16, 26, 0, Math.PI, 0);
      ctx.fill();
    } else if (side.age === 1) {
      // Castle keep with battlements.
      ctx.fillRect(x, top, BASE_W, BASE_H);
      for (let k = 0; k < 5; k++) ctx.fillRect(x + k * 17, top - 12, 11, 12);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + BASE_W / 2 - 13, GROUND - 38, 26, 38);
    } else if (side.age === 2) {
      // Fort with a sloped roof.
      ctx.fillRect(x, top + 10, BASE_W, BASE_H - 10);
      ctx.beginPath();
      ctx.moveTo(x - 6, top + 12);
      ctx.lineTo(x + BASE_W / 2, top - 18);
      ctx.lineTo(x + BASE_W + 6, top + 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 4; k++) ctx.fillRect(x, top + 26 + k * 22, BASE_W, 3);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + BASE_W / 2 - 14, GROUND - 40, 28, 40);
    } else {
      // Future tower.
      ctx.beginPath();
      ctx.moveTo(x + 6, GROUND);
      ctx.lineTo(x + 18, top - 10);
      ctx.lineTo(x + BASE_W - 18, top - 10);
      ctx.lineTo(x + BASE_W - 6, GROUND);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : a.glow;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 24, top + 8 + k * 24, BASE_W - 48, 6);
    }

    // Flag in the side's colour.
    const fx = x + BASE_W / 2;
    ctx.fillStyle = '#44403c';
    ctx.fillRect(fx - 1, top - 70, 2, 44);
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.moveTo(fx + 1, top - 70);
    ctx.lineTo(fx + 1 + side.dir * 22, top - 62);
    ctx.lineTo(fx + 1, top - 54);
    ctx.fill();

    side.turrets.forEach((tur, slot) => {
      if (tur) drawTurret(turretPos(side, slot), tur.age, tur.aim);
    });

    // Health bar and age label.
    const bw = BASE_W + 10;
    const bx = x - 5;
    const by = top - 88;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = c.body;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * (side.hp / side.maxHp), 6);
    ctx.textAlign = 'center';
    outlined(`${Math.ceil(side.hp)} / ${side.maxHp}`, bx + bw / 2, by - 4, 'bold 11px system-ui, sans-serif', '#fff');
    outlined(side.i === 0 ? 'You' : `Enemy · ${a.name}`, bx + bw / 2, by + 20, '600 10px system-ui, sans-serif', '#fff');
  }

  function drawTurret(p, age, aim) {
    const a = AGES[age];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#292524';
    ctx.fillRect(-12, -2, 24, 12);
    ctx.rotate(aim);
    ctx.fillStyle = a.metal;
    ctx.fillRect(0, -3, 20, 6);
    ctx.fillStyle = a.glow;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawUnit(u) {
    const c = SIDE_COLORS[u.side];
    const a = AGES[u.age];
    const white = u.flash > 0;
    const bob = u.moving ? Math.abs(Math.sin(u.walk)) * 2 : 0;
    const swing = u.atk > 0 ? Math.sin((u.atk / 0.25) * Math.PI) : 0;

    ctx.save();
    ctx.translate(u.x, GROUND);
    ctx.scale(u.dir, 1);

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, u.w / 2 + 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (u.t === 2) drawHeavy(u, c, a, white, bob, swing);
    else drawFoot(u, c, a, white, bob, swing);
    ctx.restore();

    if (u.hp < u.maxHp) {
      const bw = Math.max(18, u.w);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(u.x - bw / 2, GROUND - u.h - 10, bw, 4);
      ctx.fillStyle = u.side === 0 ? '#4ade80' : '#f87171';
      ctx.fillRect(u.x - bw / 2, GROUND - u.h - 10, bw * clamp(u.hp / u.maxHp, 0, 1), 4);
    }
  }

  function drawFoot(u, c, a, white, bob, swing) {
    const h = u.h;
    const legSwing = u.moving ? Math.sin(u.walk) * 5 : 0;

    ctx.strokeStyle = white ? '#fff' : c.dark;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.4 - bob);
    ctx.lineTo(legSwing, 0);
    ctx.moveTo(0, -h * 0.4 - bob);
    ctx.lineTo(-legSwing, 0);
    ctx.stroke();

    ctx.fillStyle = white ? '#fff' : c.body;
    ctx.fillRect(-u.w / 2 + 2, -h * 0.8 - bob, u.w - 4, h * 0.45);

    ctx.fillStyle = white ? '#fff' : '#f5d0a9';
    ctx.beginPath();
    ctx.arc(0, -h * 0.88 - bob, 5, 0, Math.PI * 2);
    ctx.fill();

    if (u.age >= 1) {
      ctx.fillStyle = white ? '#fff' : a.metal;
      ctx.fillRect(-5, -h * 0.88 - bob - 6, 10, 4);
    }
    if (u.age === 3) {
      ctx.fillStyle = a.glow;
      ctx.fillRect(1, -h * 0.9 - bob, 5, 2);
    }

    ctx.save();
    ctx.translate(3, -h * 0.62 - bob);
    if (u.range === 0) {
      // Melee weapon, swung during an attack.
      ctx.rotate(-0.9 + swing * 1.6);
      ctx.strokeStyle = u.age === 3 ? a.glow : u.age === 0 ? '#78350f' : a.metal;
      ctx.lineWidth = u.age === 0 ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -16);
      ctx.stroke();
    } else if (u.age === 1) {
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(4, 0, 9, -1.2, 1.2);
      ctx.stroke();
    } else if (u.age === 0) {
      ctx.rotate(-1.5 + swing * 2.5);
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(0, -12, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = u.age === 3 ? '#e2e8f0' : '#292524';
      ctx.fillRect(-2, -2, 16 - swing * 3, 4);
      if (u.age === 3) {
        ctx.fillStyle = a.glow;
        ctx.fillRect(12 - swing * 3, -2, 3, 4);
      }
    }
    ctx.restore();
  }

  function drawHeavy(u, c, a, white, bob, swing) {
    const w = u.w;
    const h = u.h;
    const legSwing = u.moving ? Math.sin(u.walk) * 5 : 0;
    const body = white ? '#fff' : c.body;

    if (u.age <= 1) {
      // Mount with rider.
      const hide = white ? '#fff' : u.age === 0 ? '#57534e' : '#78350f';
      ctx.strokeStyle = hide;
      ctx.lineWidth = 4;
      ctx.beginPath();
      [-10, -4, 6, 12].forEach((lx, k) => {
        ctx.moveTo(lx, -14 - bob);
        ctx.lineTo(lx + (k % 2 ? legSwing : -legSwing), 0);
      });
      ctx.stroke();
      ctx.fillStyle = hide;
      ctx.beginPath();
      ctx.ellipse(0, -18 - bob, w / 2 + 2, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w / 2 + 2, -24 - bob, 7, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      if (u.age === 0) {
        ctx.strokeStyle = white ? '#fff' : '#f5f5f4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 + 7, -21 - bob);
        ctx.quadraticCurveTo(w / 2 + 14, -18 - bob, w / 2 + 12, -28 - bob);
        ctx.stroke();
      }
      ctx.fillStyle = body;
      ctx.fillRect(-5, -h + 4 - bob, 10, 14);
      ctx.fillStyle = white ? '#fff' : '#f5d0a9';
      ctx.beginPath();
      ctx.arc(0, -h - bob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(3, -h + 10 - bob);
      ctx.rotate(u.age === 1 ? -0.1 + swing * 0.3 : -0.9 + swing * 1.6);
      ctx.strokeStyle = u.age === 1 ? a.metal : '#78350f';
      ctx.lineWidth = u.age === 1 ? 3 : 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(u.age === 1 ? 26 : 0, u.age === 1 ? 0 : -16);
      ctx.stroke();
      ctx.restore();
    } else if (u.age === 2) {
      // Cannon cart.
      ctx.fillStyle = body;
      ctx.fillRect(-w / 2, -20, w, 12);
      ctx.fillStyle = white ? '#fff' : '#1c1917';
      ctx.save();
      ctx.translate(4, -22);
      ctx.rotate(-0.15 - swing * 0.1);
      ctx.fillRect(-4, -5, 26 - swing * 5, 10);
      ctx.restore();
      ctx.fillStyle = white ? '#fff' : '#78350f';
      [-9, 9].forEach((wx) => {
        ctx.beginPath();
        ctx.arc(wx, -7, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // Mech.
      ctx.strokeStyle = white ? '#fff' : a.metal;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-6, -18 - bob);
      ctx.lineTo(-6 + legSwing, 0);
      ctx.moveTo(6, -18 - bob);
      ctx.lineTo(6 - legSwing, 0);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.fillRect(-w / 2, -h - bob, w, 24);
      ctx.fillStyle = a.glow;
      ctx.fillRect(w / 2 - 10, -h + 6 - bob, 7, 4);
      ctx.fillStyle = white ? '#fff' : a.metal;
      ctx.fillRect(w / 2 - 4, -h + 14 - bob, 14 - swing * 4, 5);
    }
  }

  function drawShot(s) {
    const a = AGES[s.age];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang || 0);
    if (s.age === 0) {
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(0, 0, s.turret ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.age === 1) {
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = s.turret ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
    } else if (s.age === 2) {
      ctx.fillStyle = s.turret ? '#1c1917' : '#facc15';
      ctx.beginPath();
      ctx.arc(0, 0, s.turret ? 5 : 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = a.glow;
      ctx.lineWidth = s.turret ? 4 : 2.5;
      ctx.shadowColor = a.glow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrop(d) {
    if (d.delay > 0) return;
    const a = AGES[d.age];
    if (d.age === 3) {
      ctx.save();
      ctx.strokeStyle = a.glow;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 6;
      ctx.shadowColor = a.glow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(d.x, -20);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.age === 1) {
      ctx.rotate(Math.PI / 2);
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = d.age === 0 ? '#78716c' : '#1c1917';
      ctx.beginPath();
      ctx.arc(0, 0, d.age === 0 ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(249,115,22,0.6)';
      ctx.beginPath();
      ctx.arc(0, -8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- HUD ---------------------------------------------------------------------

  function drawHud() {
    const me = state.sides[0];
    const a = AGES[me.age];
    const hover = hitTest(ui.mx, ui.my);

    // Bar background.
    ctx.fillStyle = 'rgba(12, 10, 9, 0.62)';
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, BAR - 1, W, 1);

    // Stats: gold, age, XP, training queue.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(22, 21, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 22, 25);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(String(Math.floor(me.gold)), 36, 28);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = '#e7e5e4';
    ctx.textAlign = 'right';
    ctx.fillText(`${a.name}${me.level ? ` · Army Lv ${me.level}` : ''}`, 256, 27);

    const xpFrac = a.xpNext === Infinity ? 1 : clamp(me.xp / a.xpNext, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(14, 36, 242, 10, 5);
    ctx.fill();
    ctx.fillStyle = canEvolve(me) ? '#4ade80' : '#60a5fa';
    roundRect(14, 36, Math.max(10, 242 * xpFrac), 10, 5);
    ctx.fill();
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(a.xpNext === Infinity ? `XP ${Math.floor(me.xp)}` : `XP ${Math.floor(me.xp)} / ${a.xpNext}`, 135, 44.5);

    ctx.textAlign = 'left';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#d6d3d1';
    ctx.fillText('Training', 14, 67);
    for (let k = 0; k < MAX_QUEUE; k++) {
      const x = 64 + k * 26;
      const item = me.queue[k];
      ctx.fillStyle = item ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)';
      roundRect(x, 53, 22, 22, 4);
      ctx.fill();
      if (item) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 53, 22, 22);
        ctx.clip();
        drawUnitIcon(x + 11, 73, item.age, item.t, 0.5);
        ctx.restore();
        if (k === 0) {
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(x, 73, 22 * (me.trainT / TYPES[item.t].train), 2);
        }
      }
    }

    // Action tiles.
    for (const t of hudTiles()) {
      const hot = hover && hover.kind === 'tile' && hover.item.id === t.id;
      drawTile(t, hot);
    }

    // System buttons.
    for (const b of sysButtons()) {
      const hot = hover && hover.kind === 'sys' && hover.item.id === b.id;
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
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.textAlign = 'center';
    ctx.fillText(`${difficulty[0].toUpperCase()}${difficulty.slice(1)} · ${formatTime(state.t)}`, SYS.x0 + 61, 66);

    // Mode banner.
    if (ui.mode && state.mode === 'playing') {
      const msg = ui.mode === 'build'
        ? 'Pick a slot on your base (1–3) · Esc or right-click to cancel'
        : 'Pick a turret to sell (1–3) · Esc or right-click to cancel';
      ctx.font = '600 13px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 24;
      ctx.fillStyle = 'rgba(12,10,9,0.7)';
      roundRect(W / 2 - w / 2, BAR + 10, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(msg, W / 2, BAR + 27);
    }

    // Tooltip.
    if (hover && state.mode !== 'menu') {
      const lines = hover.kind === 'slot' ? slotTip(hover.item.slot) : hover.item.tip;
      const anchorX = hover.kind === 'slot' ? hover.item.cx + 24 : hover.item.x;
      const anchorY = hover.kind === 'slot' ? hover.item.cy - 20 : BAR + (ui.mode ? 44 : 8);
      drawTooltip(lines, anchorX, anchorY);
    }
    canvas.style.cursor = hover && (hover.kind !== 'tile' || hover.item.enabled || hover.item.active) ? 'pointer' : 'default';
  }

  function drawTile(t, hot) {
    const enabled = t.enabled || t.active;
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.45;
    ctx.fillStyle = t.active ? '#dbeafe' : hot && enabled ? '#ffffff' : 'rgba(255,255,255,0.86)';
    roundRect(t.x, t.y, t.w, t.h, 8);
    ctx.fill();
    if (t.active || t.glow) {
      const pulse = t.glow ? 0.5 + 0.5 * Math.sin(performance.now() / 200) : 1;
      ctx.strokeStyle = t.active ? '#2563eb' : `rgba(74, 222, 128, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      roundRect(t.x + 1.5, t.y + 1.5, t.w - 3, t.h - 3, 7);
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(t.x, t.y, t.w, t.h - 16);
    ctx.clip();
    t.icon(t.x + t.w / 2, t.y + t.h - 18);
    ctx.restore();

    if (t.cooldown > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t.x, t.y, t.w, t.h * t.cooldown);
    }

    ctx.fillStyle = '#1c1917';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.cost, t.x + t.w / 2, t.y + t.h - 5);
    ctx.fillStyle = '#78716c';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(t.key, t.x + t.w - 5, t.y + 11);
    ctx.restore();
  }

  function drawTooltip(lines, x, y) {
    ctx.font = '12px system-ui, sans-serif';
    const w = Math.max(...lines.map((l, i) => {
      ctx.font = i === 0 ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif';
      return ctx.measureText(l).width;
    })) + 20;
    const h = lines.length * 17 + 12;
    x = clamp(x, 6, W - w - 6);
    y = clamp(y, BAR + 4, H - h - 6);
    ctx.fillStyle = 'rgba(12,10,9,0.88)';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      ctx.font = i === 0 ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillStyle = i === 0 ? '#fff' : '#d6d3d1';
      ctx.fillText(l, x + 10, y + 20 + i * 17);
    });
  }

  function drawSlotPicker() {
    const me = state.sides[0];
    const hover = hitTest(ui.mx, ui.my);
    for (const s of slotSpots()) {
      const k = s.slot;
      const tur = me.turrets[k];
      let color;
      let label;
      if (ui.mode === 'sell') {
        if (!tur) continue;
        color = '#f87171';
        label = '$';
      } else if (!me.open[k]) {
        color = '#facc15';
        label = '+';
      } else if (!tur) {
        color = '#4ade80';
        label = '';
      } else if (tur.age < me.age) {
        color = '#fb923c';
        label = '↑';
      } else {
        color = 'rgba(255,255,255,0.5)';
        label = '';
      }
      const hot = hover && hover.kind === 'slot' && hover.item.slot === k;
      ctx.save();
      ctx.setLineDash(tur || ui.mode === 'sell' ? [] : [4, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = hot ? 3 : 2;
      ctx.fillStyle = hot ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      roundRect(s.x, s.y, s.w, s.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'center';
      if (label) outlined(label, s.cx, s.cy + 5, 'bold 16px system-ui, sans-serif', color);
      outlined(String(k + 1), s.x + s.w + 6, s.y + 10, 'bold 10px system-ui, sans-serif', '#fff');
      if (hot && ui.mode === 'build') {
        // Show the slot's reach along the ground.
        ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
        ctx.fillRect(front(me), GROUND - 6, SLOTS[k].range, 6);
      }
    }
  }

  // --- HUD icons -----------------------------------------------------------------

  function drawUnitIcon(x, y, age, t, scale = t === 2 ? 0.8 : 1) {
    const ty = TYPES[t];
    const fake = {
      side: 0, dir: 1, age, t, w: ty.w, h: ty.h, range: ty.range,
      moving: false, walk: 0, atk: 0, flash: 0,
    };
    ctx.save();
    ctx.translate(x - (t === 2 ? 3 : 0), y);
    ctx.scale(scale, scale);
    if (t === 2) drawHeavy(fake, SIDE_COLORS[0], AGES[age], false, 0, 0);
    else drawFoot(fake, SIDE_COLORS[0], AGES[age], false, 0, 0);
    ctx.restore();
  }

  function drawTurretIcon(x, y, age) {
    drawTurret({ x, y: y - 14 }, age, -0.4);
  }

  function drawSellIcon(x, y) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', x, y - 11);
  }

  function drawUpgradeIcon(x, y, level) {
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [0, 10].forEach((dy) => {
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 12 - dy + 6);
      ctx.lineTo(x, y - 22 - dy + 6);
      ctx.lineTo(x + 10, y - 12 - dy + 6);
      ctx.stroke();
    });
    if (level) {
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(level), x + 12, y - 2);
    }
  }

  function drawSpecialIcon(x, y, age) {
    const a = AGES[age];
    ctx.strokeStyle = age === 3 ? a.glow : '#57534e';
    ctx.lineWidth = age === 3 ? 3 : 2;
    [-10, 0, 10].forEach((dx, k) => {
      ctx.beginPath();
      ctx.moveTo(x + dx - 4, y - 34 + k * 3);
      ctx.lineTo(x + dx + 2, y - 14 + k * 3);
      ctx.stroke();
    });
    ctx.fillStyle = age === 3 ? a.glow : '#f97316';
    ctx.beginPath();
    ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEvolveIcon(x, y) {
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 6 : 14;
      const ang = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(ang) * r, y - 17 + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Overlays (menu, pause, game over) and input
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    const diffButtons = Object.keys(DIFFICULTY).map((d) =>
      `<button type="button" data-start="${d}" class="${d === difficulty ? 'primary' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`,
    ).join('');

    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2>Nameless War</h2>
          <p>Train an army, hold the line, evolve through four ages, and destroy the enemy base.</p>
          <div class="row">${diffButtons}</div>
          <p class="help">1 2 3 train · T build turret · S sell · U upgrade · Q special · E evolve · P pause · F fullscreen</p>
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
      const me = state.sides[0];
      const won = state.winner === 0;
      overlay.innerHTML = `
        <div>
          <h2>${won ? 'Victory' : 'Defeat'}</h2>
          <p>${won ? 'The enemy base has fallen.' : 'Your base has fallen.'}</p>
          <p>Time ${formatTime(state.t)} · Kills ${me.kills} · Reached ${AGES[me.age].name}</p>
          <div class="row">${diffButtons}</div>
          <p class="help">Pick a difficulty to play again.</p>
        </div>`;
    }
    overlay.classList.add('open');
  }

  // The menu sits over a fresh, idle battlefield so the HUD shows Stone Age units.
  function showMenu() {
    newGame();
    state.mode = 'menu';
    showOverlay('menu');
  }

  function start(d) {
    difficulty = d;
    newGame();
    showOverlay(null);
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing') {
      state.mode = 'paused';
      ui.mode = null;
      showOverlay('paused');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      showOverlay(null);
    }
  }

  function toggleMute() {
    Sound.muted = !Sound.muted;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    if (b.dataset.start) start(b.dataset.start);
    else if (b.dataset.act === 'resume') togglePause();
    else if (b.dataset.act === 'menu') showMenu();
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    ui.mx = p.x;
    ui.my = p.y;
  });
  canvas.addEventListener('pointerleave', () => {
    ui.mx = -1;
    ui.my = -1;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (e.button === 2) return;
    const p = toCanvas(e);
    ui.mx = p.x;
    ui.my = p.y;
    const hit = hitTest(p.x, p.y);
    if (!hit) {
      // Clicking empty space leaves placement mode.
      ui.mode = null;
      return;
    }
    if (hit.kind === 'slot') slotAction(hit.item.slot);
    else activate(hit.item.id);
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ui.mode = null;
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'escape' && ui.mode) { ui.mode = null; return; }
    if (k === 'm') { toggleMute(); return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state || state.mode !== 'playing' || state.sides[0].ai) return;
    if (ui.mode && (k === '1' || k === '2' || k === '3')) slotAction(Number(k) - 1);
    else if (k === '1' || k === '2' || k === '3') activate(`unit${Number(k) - 1}`);
    else if (k === 't') activate('build');
    else if (k === 's') activate('sell');
    else if (k === 'u') activate('upgrade');
    else if (k === 'q') activate('special');
    else if (k === 'e') activate('evolve');
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

  // Hooks for automated testing (?autoplay pits the AI against itself).
  window.__nw = {
    get state() { return state; },
    ui,
    start,
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
  };

  if (AUTOPLAY) start(params.get('difficulty') || 'normal');
  else showMenu();
  requestAnimationFrame(frame);
})();
