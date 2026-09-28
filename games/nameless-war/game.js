'use strict';

// Nameless War: a lane battle across four ages.
// Everything is drawn with canvas shapes; there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 420;
  const GROUND = 350;
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

  const TURRET = { cost: 120, dmg: 11, range: 300, rate: 1.1 };
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
  const unitCost = (side, t) => Math.round(TYPES[t].cost * AGES[side.age].costMult);
  const turretCost = (side) => Math.round(TURRET.cost * AGES[side.age].costMult);
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
      turrets: [null, null],
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
  }

  // ---------------------------------------------------------------------------
  // Actions (used by both the player and the AI)
  // ---------------------------------------------------------------------------

  function train(side, t) {
    if (state.mode !== 'playing') return false;
    const cost = unitCost(side, t);
    if (side.queue.length >= MAX_QUEUE || side.gold < cost) {
      if (!side.ai) Sound.deny();
      return false;
    }
    side.gold -= cost;
    side.queue.push({ t, age: side.age });
    if (!side.ai) Sound.click();
    return true;
  }

  function buyTurret(side) {
    if (state.mode !== 'playing') return false;
    const slot = side.turrets.indexOf(null);
    const cost = turretCost(side);
    if (slot < 0 || side.gold < cost) {
      if (!side.ai) Sound.deny();
      return false;
    }
    side.gold -= cost;
    side.turrets[slot] = { age: side.age, cd: 0.5, cost, aim: side.i === 0 ? 0 : Math.PI };
    burst(turretPos(side, slot).x, turretPos(side, slot).y, AGES[side.age].glow, 10, 120);
    if (!side.ai) Sound.click();
    return true;
  }

  function sellTurret(side, slot) {
    if (state.mode !== 'playing') return false;
    if (slot === undefined) {
      slot = side.turrets[1] ? 1 : side.turrets[0] ? 0 : -1;
    }
    const tur = side.turrets[slot];
    if (!tur) return false;
    const refund = Math.round(tur.cost * 0.5);
    side.gold += refund;
    side.turrets[slot] = null;
    const p = turretPos(side, slot);
    addText(p.x, p.y - 10, `+${refund}`, '#facc15');
    if (!side.ai) Sound.click();
    return true;
  }

  function castSpecial(side) {
    if (state.mode !== 'playing' || side.specialCd > 0) {
      if (!side.ai) Sound.deny();
      return false;
    }
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
    if (state.mode !== 'playing' || side.gold < cost) {
      if (!side.ai) Sound.deny();
      return false;
    }
    side.gold -= cost;
    side.level++;
    const cx = side.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2;
    addText(cx, GROUND - BASE_H - 30, `Army Lv ${side.level}`, '#fff', 1.2);
    if (!side.ai) Sound.click();
    return true;
  }

  function evolve(side) {
    if (state.mode !== 'playing' || !canEvolve(side)) {
      if (!side.ai) Sound.deny();
      return false;
    }
    side.age++;
    const max = AGES[side.age].baseHp;
    side.hp += max - side.maxHp;
    side.maxHp = max;
    const cx = side.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2;
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
    return {
      x: side.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2,
      y: GROUND - BASE_H - 12 - slot * 24,
    };
  }

  function updateTurrets(side, dt) {
    side.turrets.forEach((tur, slot) => {
      if (!tur) return;
      tur.cd -= dt;
      let target = null;
      let best = TURRET.range;
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

    const tc = turretCost(side);
    if (state.t > 30 && side.turrets.includes(null) && side.gold >= tc * 1.5) {
      buyTurret(side);
      return;
    }
    const old = side.turrets.findIndex((t) => t && t.age < side.age);
    if (old >= 0 && side.gold >= tc * 2.2) {
      sellTurret(side, old);
      buyTurret(side);
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
    const loser = state.sides[1 - winner];
    const cx = loser.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2;
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
  // Rendering
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
  }
  window.addEventListener('resize', resize);
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
        ctx.globalAlpha = clamp(t.life / t.max * 1.5, 0, 1);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawBackground(a) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, a.sky[0]);
    g.addColorStop(1, a.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(820, 80, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = a.hills;
    ctx.globalAlpha = 0.55;
    hills(250, 60, 0.006, 1.3);
    ctx.globalAlpha = 1;
    hills(290, 40, 0.01, 4.1);

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
      if (tur) drawTurret(side, tur, slot);
    });

    // Health bar.
    const bw = BASE_W + 10;
    const bx = x - 5;
    const by = top - 88;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = c.body;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * (side.hp / side.maxHp), 6);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const label = `${Math.ceil(side.hp)} / ${side.maxHp}`;
    ctx.strokeText(label, bx + bw / 2, by - 4);
    ctx.fillText(label, bx + bw / 2, by - 4);
  }

  function drawTurret(side, tur, slot) {
    const p = turretPos(side, slot);
    const a = AGES[tur.age];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#292524';
    ctx.fillRect(-12, -2, 24, 12);
    ctx.rotate(tur.aim);
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

  // ---------------------------------------------------------------------------
  // HUD and controls
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const el = {
    gold: $('gold'), age: $('age'), xp: $('xp'), xpbar: $('xpbar'), queue: $('queue'),
    pause: $('pauseBtn'), mute: $('muteBtn'), overlay: $('overlay'),
    turret: $('turretBtn'), sell: $('sellBtn'), upgrade: $('upgradeBtn'), special: $('specialBtn'), evolve: $('evolveBtn'),
    units: [...document.querySelectorAll('.unit')],
  };

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setDisabled(node, off) {
    if (node.disabled !== off) node.disabled = off;
  }

  // Build the five training slots once.
  for (let k = 0; k < MAX_QUEUE; k++) {
    const slot = document.createElement('div');
    slot.className = 'nw-slot';
    slot.innerHTML = '<span></span><i></i>';
    el.queue.appendChild(slot);
  }

  function updateHud() {
    if (!state) return;
    const me = state.sides[0];
    const a = AGES[me.age];
    const playing = state.mode === 'playing';

    setText(el.gold, String(Math.floor(me.gold)));
    setText(el.age, a.name);
    if (a.xpNext === Infinity) {
      setText(el.xp, `${Math.floor(me.xp)} (max age)`);
      el.xpbar.style.width = '100%';
    } else {
      setText(el.xp, `${Math.floor(me.xp)} / ${a.xpNext}`);
      el.xpbar.style.width = `${clamp(me.xp / a.xpNext, 0, 1) * 100}%`;
    }

    el.units.forEach((btn, t) => {
      const cost = unitCost(me, t);
      const ty = TYPES[t];
      setText(btn.querySelector('.n'), a.units[t]);
      setText(btn.querySelector('.c'), `${cost} gold`);
      setText(btn.querySelector('.s'),
        `HP ${Math.round(ty.hp * a.mult)} · DMG ${Math.round(ty.dmg * a.mult)}${ty.range ? ' · ranged' : ''}`);
      setDisabled(btn, !playing || me.ai || me.gold < cost || me.queue.length >= MAX_QUEUE);
    });

    const tc = turretCost(me);
    const hasSlot = me.turrets.includes(null);
    setText(el.turret.querySelector('.n'), a.turret);
    setText(el.turret.querySelector('.c'), hasSlot ? `${tc} gold` : 'Both slots full');
    setDisabled(el.turret, !playing || me.ai || !hasSlot || me.gold < tc);

    const sellSlot = me.turrets[1] ? 1 : me.turrets[0] ? 0 : -1;
    setText(el.sell.querySelector('.c'), sellSlot >= 0 ? `+${Math.round(me.turrets[sellSlot].cost * 0.5)} gold` : 'No turrets');
    setDisabled(el.sell, !playing || me.ai || sellSlot < 0);

    const uc = upgradeCost(me);
    setText(el.upgrade.querySelector('.n'), `Upgrade army (Lv ${me.level})`);
    setText(el.upgrade.querySelector('.c'), `${uc} gold`);
    setDisabled(el.upgrade, !playing || me.ai || me.gold < uc);

    setText(el.special.querySelector('.n'), a.special);
    setText(el.special.querySelector('.c'), me.specialCd > 0 ? `Ready in ${Math.ceil(me.specialCd)}s` : 'Ready');
    setDisabled(el.special, !playing || me.ai || me.specialCd > 0);
    el.special.classList.toggle('ready', playing && !me.ai && me.specialCd <= 0);

    const next = AGES[me.age + 1];
    setText(el.evolve.querySelector('.n'), next ? `Evolve: ${next.name}` : 'Final age');
    setText(el.evolve.querySelector('.c'), next ? `${a.xpNext} XP` : '');
    setText(el.evolve.querySelector('.s'), next ? 'New units, heals base' : 'Nothing left to unlock');
    setDisabled(el.evolve, !playing || me.ai || !canEvolve(me));
    el.evolve.classList.toggle('ready', playing && !me.ai && canEvolve(me));

    [...el.queue.children].forEach((slot, k) => {
      const item = me.queue[k];
      setText(slot.firstChild, item ? String(item.t + 1) : '');
      slot.lastChild.style.width = item && k === 0 ? `${(me.trainT / TYPES[item.t].train) * 100}%` : '0';
    });

    setText(el.pause, state.mode === 'paused' ? 'Resume' : 'Pause');
    setDisabled(el.pause, state.mode !== 'playing' && state.mode !== 'paused');
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showOverlay(kind) {
    const o = el.overlay;
    if (!kind) {
      o.classList.remove('open');
      o.innerHTML = '';
      return;
    }
    const diffButtons = Object.keys(DIFFICULTY).map((d) =>
      `<button type="button" data-start="${d}" class="${d === difficulty ? 'primary' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`,
    ).join('');

    if (kind === 'menu') {
      o.innerHTML = `
        <div>
          <h2>Nameless War</h2>
          <p>Train an army, hold the line, evolve through four ages, and destroy the enemy base.</p>
          <div class="row">${diffButtons}</div>
          <p class="help">1 2 3 train units · T turret · S sell · U upgrade · Q special · E evolve · P pause · M sound</p>
        </div>`;
    } else if (kind === 'paused') {
      o.innerHTML = `
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
      o.innerHTML = `
        <div>
          <h2>${won ? 'Victory' : 'Defeat'}</h2>
          <p>${won ? 'The enemy base has fallen.' : 'Your base has fallen.'}</p>
          <p>Time ${formatTime(state.t)} · Kills ${me.kills} · Reached ${AGES[me.age].name}</p>
          <div class="row">${diffButtons}</div>
          <p class="help">Pick a difficulty to play again.</p>
        </div>`;
    }
    o.classList.add('open');
  }

  // The menu sits over a fresh, idle battlefield so the controls show Stone Age units.
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
      showOverlay('paused');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      showOverlay(null);
    }
  }

  function toggleMute() {
    Sound.muted = !Sound.muted;
    setText(el.mute, Sound.muted ? 'Sound: off' : 'Sound: on');
  }

  el.overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    if (b.dataset.start) start(b.dataset.start);
    else if (b.dataset.act === 'resume') togglePause();
    else if (b.dataset.act === 'menu') showMenu();
  });

  const me = () => state && state.sides[0];
  el.units.forEach((btn, t) => btn.addEventListener('click', () => train(me(), t)));
  el.turret.addEventListener('click', () => buyTurret(me()));
  el.sell.addEventListener('click', () => sellTurret(me()));
  el.upgrade.addEventListener('click', () => upgrade(me()));
  el.special.addEventListener('click', () => castSpecial(me()));
  el.evolve.addEventListener('click', () => evolve(me()));
  el.pause.addEventListener('click', togglePause);
  el.mute.addEventListener('click', toggleMute);
  document.addEventListener('pointerdown', () => Sound.unlock());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { toggleMute(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state || state.mode !== 'playing' || me().ai) return;
    if (k === '1' || k === '2' || k === '3') train(me(), Number(k) - 1);
    else if (k === 't') buyTurret(me());
    else if (k === 's') sellTurret(me());
    else if (k === 'u') upgrade(me());
    else if (k === 'q') castSpecial(me());
    else if (k === 'e') evolve(me());
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
    updateHud();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing (?autoplay pits the AI against itself).
  window.__nw = {
    get state() { return state; },
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
