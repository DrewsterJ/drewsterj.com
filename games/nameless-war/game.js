'use strict';

// Nameless War: a lane battle across four ages.
// Everything, including the HUD, the generals' portraits and the buttons, is
// drawn on one canvas; there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const BAR = 80; // height of the HUD bar across the top
  const GROUND = 488;
  const BASE_W = 80;
  const BASE_H = 110;
  const LANE_L = 20 + BASE_W; // front of the player's base
  const LANE_R = W - 20 - BASE_W; // front of the enemy base
  const MID = W / 2;
  const MARGIN = 24; // the cached battlefield overhangs the edges so shake never shows a seam

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const REDUCED_MOTION = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Base stats for the three unit slots; each age multiplies them.
  const TYPES = [
    { role: 'Infantry', cost: 15, hp: 60, dmg: 12, range: 0, rate: 1.0, speed: 42, train: 1.0, w: 16, h: 30, xp: 30 },
    { role: 'Ranged', cost: 25, hp: 40, dmg: 9, range: 160, rate: 1.3, speed: 40, train: 1.4, w: 14, h: 28, xp: 45 },
    { role: 'Heavy', cost: 100, hp: 280, dmg: 32, range: 0, rate: 1.6, speed: 30, train: 3.2, w: 30, h: 40, xp: 160 },
  ];
  // Counters: unit type t deals bonus damage to type BEATS[t].
  // Infantry beats heavies, ranged beats infantry, heavies beat ranged.
  const BEATS = [2, 0, 1];
  const COUNTER = 1.35;

  const AGES = [
    {
      name: 'Stone Age', mult: 1, costMult: 1, baseHp: 1000, xpNext: 1200,
      units: ['Clubber', 'Slinger', 'Tusk Rider'], turret: 'Rock Tosser',
      special: 'Rockfall', ult: 'Meteor Shower', ultInfo: 'Flaming meteors crash down on the target.',
      tagline: 'Caves, clubs and a grumpy volcano',
      metal: '#6b4a2b', glow: '#f97316',
    },
    {
      name: 'Iron Age', mult: 2.5, costMult: 2.3, baseHp: 1800, xpNext: 4500,
      units: ['Swordsman', 'Archer', 'Knight'], turret: 'Ballista',
      special: 'Arrow Storm', ult: 'Catapult Barrage', ultInfo: 'Your castle hurls blazing boulders at the target.',
      tagline: 'Stone keeps, banners and steel',
      metal: '#9ca3af', glow: '#fde68a',
    },
    {
      name: 'Powder Age', mult: 6, costMult: 5.5, baseHp: 3000, xpNext: 14000,
      units: ['Rifleman', 'Grenadier', 'Cannon Cart'], turret: 'Cannon',
      special: 'Grenade Volley', ult: 'Artillery Barrage', ultInfo: 'Long-range guns shell the target area.',
      tagline: 'Smoke, brick and gunpowder',
      metal: '#374151', glow: '#fb923c',
    },
    {
      name: 'Future Age', mult: 14, costMult: 12, baseHp: 4800, xpNext: Infinity,
      units: ['Trooper', 'Laser Gunner', 'Mech'], turret: 'Laser Turret',
      special: 'Plasma Rain', ult: 'Orbital Laser', ultInfo: 'A satellite beam sweeps across the target.',
      tagline: 'Neon towers and orbital guns',
      metal: '#94a3b8', glow: '#22d3ee',
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

  // Ultimates charge from kills: a full bar needs kills worth CHARGE gold
  // (scaled by the killer's age). Losing castle HP charges it too.
  const ULT = { charge: 560, castleCharge: 0.5, windup: 0.9, radius: 120, castle: 0.3 };
  const ULT_MIN = LANE_L + 60;
  const ULT_MAX = LANE_R + 20;
  const ULTS = [
    { count: 7, gap: 0.26, radius: 62, dmg: 150 }, // Meteor Shower
    { count: 10, gap: 0.17, radius: 52, dmg: 105 }, // Catapult Barrage
    { count: 14, gap: 0.12, radius: 46, dmg: 85 }, // Artillery Barrage
    { dur: 2.4, width: 30, dps: 640 }, // Orbital Laser
  ];

  // After this many seconds castles start to crumble faster, so games always end.
  const OVERTIME = 720;
  const OVERTIME_RAMP = 0.5; // extra castle damage per minute of overtime

  // How the computer plays. Weights pick unit types; the rest are thresholds.
  const PERSONAS = {
    balanced: { melee: 1, ranged: 1, heavy: 0.55, turretAt: 30, turretGold: 1.5, slotsAt: 60, upgrade: 0.3, queue: 3, ultValue: 5, smart: 0.3 },
    rusher: { melee: 2.2, ranged: 0.6, heavy: 0.8, turretAt: 240, turretGold: 2.5, slotsAt: 420, upgrade: 0.12, queue: 5, ultValue: 4, smart: 0 },
    turtle: { melee: 0.8, ranged: 1.4, heavy: 0.35, turretAt: 15, turretGold: 1.0, slotsAt: 15, upgrade: 0.45, queue: 2, ultValue: 4, smart: 0.3 },
    ager: { melee: 1, ranged: 1.3, heavy: 0.4, turretAt: 40, turretGold: 1.6, slotsAt: 100, upgrade: 0.15, queue: 3, ultValue: 5, smart: 0.4, xpMult: 1.5 },
    bomber: { melee: 1, ranged: 1, heavy: 0.5, turretAt: 40, turretGold: 1.6, slotsAt: 90, upgrade: 0.25, queue: 3, ultValue: 3, smart: 0.2, charge: 1.3, specialCd: 0.85 },
    juggernaut: { melee: 0.8, ranged: 0.7, heavy: 1.7, turretAt: 50, turretGold: 1.8, slotsAt: 120, upgrade: 0.6, queue: 3, ultValue: 5, smart: 0.4 },
    warlord: { melee: 1, ranged: 1.1, heavy: 0.7, turretAt: 25, turretGold: 1.4, slotsAt: 60, upgrade: 0.35, queue: 4, ultValue: 4, smart: 0.6, charge: 1.15, specialCd: 0.9 },
  };

  // Bonuses for the computer player in Skirmish. special = how many nearby
  // enemies make the AI use its special (0 = never).
  const DIFFICULTY = {
    easy: { gold: 0.75, xp: 1.5, think: 1.4, special: 0 },
    normal: { gold: 1.0, xp: 4, think: 1.0, special: 6 },
    hard: { gold: 1.4, xp: 8, think: 0.7, special: 4 },
  };

  // The campaign: six rival generals, each harder than the last.
  // par is the time limit (seconds) for the third star.
  const GENERALS = [
    {
      name: 'Grok', title: 'the Rash', tag: 'Rusher', persona: 'rusher', color: '#c2410c',
      gold: 0.8, xp: 1, think: 1.25, special: 6, par: 600,
      blurb: 'Charges in before the fire is lit. Hold the line early.',
      look: { skin: '#d6a374', hair: '#c2410c', style: 'wild', beard: '#9a3412', brow: 'uni', extra: 'bone' },
      intro: [
        ['gen', 'GROK SMASH! Grok no wait. Grok attack NOW!'],
        ['you', 'He rushes in early. A turret and a few Slingers should hold him.'],
        ['gen', 'Little castle look tasty...'],
      ],
      taunts: { evolve: 'Grok find shiny metal!', ult: 'SKY ROCKS FALL!', hurt: 'Grok... not like this!', winning: 'Grok winning! Grok smart!' },
    },
    {
      name: 'Lady Morwen', title: 'the Warden', tag: 'Turtle', persona: 'turtle', color: '#475569',
      gold: 0.7, xp: 1, think: 1.2, special: 5, par: 720,
      blurb: 'Walls first, questions never. Out-scale her turrets.',
      look: { skin: '#f1c7a5', hair: '#57534e', style: 'helm', brow: 'stern', extra: 'braids' },
      intro: [
        ['gen', 'My walls have stood for a hundred winters. Yours will not see one.'],
        ['you', 'She hides behind turrets. Heavies soak the shots; Upgrade and push.'],
        ['gen', 'Come then. Break yourself upon my gates.'],
      ],
      taunts: { evolve: 'Thicker walls. Naturally.', ult: 'Loose the stones!', hurt: 'The gates! Hold the gates!', winning: 'Patience always wins.' },
    },
    {
      name: 'Prof. Cogsworth', title: 'of the Clockworks', tag: 'Speed-ager', persona: 'ager', color: '#a16207',
      gold: 0.85, xp: 6, think: 1.05, special: 5, par: 780,
      blurb: 'Races through the ages. Hit him before his tech pays off.',
      look: { skin: '#f3d3b0', hair: '#e7e5e4', style: 'tophat', beard: '#e7e5e4', brow: 'raised', extra: 'monocle' },
      intro: [
        ['gen', 'Fascinating! A specimen still banging rocks together.'],
        ['you', 'He ages up fast. Strike hard before his new toys arrive.'],
        ['gen', 'Progress waits for no one, dear fellow. Least of all you.'],
      ],
      taunts: { evolve: 'Eureka! Another age!', ult: 'Observe: SCIENCE.', hurt: 'My calculations... were off?', winning: 'As predicted. To the decimal.' },
    },
    {
      name: 'Pyra', title: 'Ashfall', tag: 'Bombardier', persona: 'bomber', color: '#dc2626',
      gold: 0.85, xp: 2, think: 1.05, special: 5, par: 840,
      blurb: 'Lives for explosions. Spread out and keep your castle stocked.',
      look: { skin: '#e8b48f', hair: '#ef4444', style: 'flame', brow: 'sharp', extra: 'goggles' },
      intro: [
        ['gen', 'Ooh, a crowded little battlefield. Shame if something... exploded.'],
        ['you', 'She casts specials and ultimates constantly. Keep turrets up and do not bunch up.'],
        ['gen', 'Light the fuses!'],
      ],
      taunts: { evolve: 'Bigger booms unlocked!', ult: 'KABOOM, darling!', hurt: 'You singed my hair!', winning: 'Everything burns so nicely.' },
    },
    {
      name: 'Krag', title: 'Ironhide', tag: 'Juggernaut', persona: 'juggernaut', color: '#57534e',
      gold: 1.05, xp: 3, think: 0.9, special: 4, par: 900,
      blurb: 'Huge armoured heavies and endless upgrades. Infantry cut them down.',
      look: { skin: '#b98a6a', hair: '#292524', style: 'horns', beard: '#292524', brow: 'heavy', extra: 'scar' },
      intro: [
        ['gen', 'Krag has crushed nine kingdoms. You will be ten.'],
        ['you', 'All heavies and upgrades. Infantry deal extra damage to heavies.'],
        ['gen', 'Bring your little soldiers. Krag is hungry.'],
      ],
      taunts: { evolve: 'More armour. MORE.', ult: 'Feel the hammer of Krag!', hurt: 'Krag... bleeds?', winning: 'Kneel.' },
    },
    {
      name: 'The Nameless', title: 'who started it all', tag: 'Warlord', persona: 'warlord', color: '#7c3aed',
      gold: 1.2, xp: 6, think: 0.8, special: 5, par: 1020,
      blurb: 'Reads your army and counters it. Everything you have learned, at once.',
      look: { skin: '#1c1917', hair: '#312e81', style: 'hood', brow: 'none', extra: 'eyes' },
      intro: [
        ['gen', 'Every age. Every war. Every one of them... was mine.'],
        ['you', 'So you are the one behind it all. Mix your army; it counters whatever you spam.'],
        ['gen', 'Then come, little general. End the war, if you can.'],
      ],
      taunts: { evolve: 'Time bends to me.', ult: 'Witness the end of ages.', hurt: 'Impossible...', winning: 'All wars end the same way.' },
    },
  ];
  const PLAYER_LOOK = { skin: '#f1c7a5', hair: '#78350f', style: 'cap', brow: 'stern', extra: 'medal', color: '#2563eb' };

  const SIDE_COLORS = [
    { body: '#2563eb', dark: '#1e3a8a', light: '#93c5fd' },
    { body: '#dc2626', dark: '#7f1d1d', light: '#fca5a5' },
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const front = (side) => (side.i === 0 ? LANE_L : LANE_R);
  const baseCenter = (side) => (side.i === 0 ? 20 + BASE_W / 2 : W - 20 - BASE_W / 2);
  const unitCost = (side, t) => Math.round(TYPES[t].cost * AGES[side.age].costMult);
  const turretCost = (side) => Math.round(TURRET.cost * AGES[side.age].costMult);
  const unlockCost = (side) => SLOT_UNLOCK[side.open.filter(Boolean).length] ?? Infinity;
  const upgradeCost = (side) => UPGRADE.cost * (side.level + 1);
  const power = (side) => 1 + side.level * UPGRADE.bonus;
  const canEvolve = (side) => side.age < AGES.length - 1 && side.xp >= AGES[side.age].xpNext;
  const aiBonus = (side) => side.bonus;
  const enemyName = () => (state && state.general ? state.general.name : 'Enemy');
  const fx = (n) => (save.effects === 'reduced' ? Math.ceil(n * 0.4) : n); // particle budget

  // Small seeded random, so painted backgrounds look the same on every redraw.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Save data (campaign stars and settings)
  // ---------------------------------------------------------------------------

  const SAVE_KEY = 'nameless-war';
  const save = {
    stars: GENERALS.map(() => 0),
    tutorial: false, // true once the first-play tutorial is finished or skipped
    shake: !REDUCED_MOTION,
    effects: REDUCED_MOTION ? 'reduced' : 'full',
    hints: true,
    muted: false,
    difficulty: 'normal',
  };

  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.stars)) {
        save.stars = GENERALS.map((g, k) => clamp(Number(data.stars[k]) || 0, 0, 3));
      }
      if (typeof data.tutorial === 'boolean') save.tutorial = data.tutorial;
      if (typeof data.shake === 'boolean') save.shake = data.shake;
      if (data.effects === 'full' || data.effects === 'reduced') save.effects = data.effects;
      if (typeof data.hints === 'boolean') save.hints = data.hints;
      if (typeof data.muted === 'boolean') save.muted = data.muted;
      if (DIFFICULTY[data.difficulty]) save.difficulty = data.difficulty;
    } catch (e) {
      // Storage blocked or corrupt: keep the defaults.
    }
  }

  function storeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      // Storage blocked: progress just won't persist.
    }
  }

  loadSave();

  // A stage is open once the one before it has been beaten.
  const stageOpen = (k) => k === 0 || save.stars[k - 1] > 0;

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    out: null,
    muted: save.muted,
    quiet: false, // set while the menu's demo battle runs
    last: {},
    noiseBuf: null,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // Everything goes through a compressor so layered booms never clip.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.9;
        this.out.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    play(name, gap, fn) {
      if (this.muted || this.quiet || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      fn(this.ctx, now);
    },

    tone(freq, dur, type, vol, slideTo, delay = 0, filter = 0) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (filter) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        o.connect(f).connect(g);
      } else {
        o.connect(g);
      }
      g.connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

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
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur);
    },

    hit(heavy) {
      this.play('hit', 0.05, () => {
        this.noise(0.07, 0.14, 2400);
        this.tone(heavy ? 120 : 190, 0.08, 'triangle', 0.08, 60);
      });
    },
    shoot(age) {
      this.play('shoot', 0.06, () => {
        if (age === 0) this.noise(0.09, 0.06, 1400, 0, 'bandpass', 500);
        else if (age === 1) this.tone(330, 0.09, 'triangle', 0.06, 140);
        else if (age === 2) { this.noise(0.08, 0.12, 3000); this.tone(150, 0.06, 'square', 0.03, 60); }
        else this.tone(1400, 0.1, 'sine', 0.05, 320);
      });
    },
    death() {
      this.play('death', 0.08, () => {
        this.tone(rand(220, 300), 0.22, 'sawtooth', 0.04, 70, 0, 1200);
        this.noise(0.12, 0.1, 400, 0.05);
      });
    },
    boom(big) {
      this.play(big ? 'bigboom' : 'boom', big ? 0.09 : 0.07, () => {
        this.noise(big ? 0.9 : 0.45, big ? 0.38 : 0.26, big ? 700 : 500, 0, 'lowpass', 90);
        this.tone(big ? 95 : 120, big ? 0.6 : 0.3, 'sine', big ? 0.32 : 0.18, 32);
      });
    },
    base() { this.play('base', 0.15, () => { this.noise(0.25, 0.22, 300); this.tone(80, 0.18, 'sine', 0.12, 45); }); },
    crumble() {
      this.play('crumble', 0.6, () => {
        this.noise(2.4, 0.45, 260, 0, 'lowpass', 50);
        this.tone(60, 2, 'sine', 0.3, 25);
        for (let k = 0; k < 5; k++) this.noise(0.3, 0.2, 900, 0.2 + k * 0.32);
      });
    },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
    ready() {
      this.play('ready', 1, () => {
        [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.06, null, i * 0.07));
      });
    },
    whoosh() { this.play('whoosh', 0.5, () => this.noise(1.2, 0.18, 300, 0, 'bandpass', 4000)); },
    // A brassy chord over a timpani roll.
    fanfare() {
      this.play('fanfare', 1, () => {
        const notes = [[392, 0], [523, 0.16], [659, 0.32], [784, 0.48], [1047, 0.72]];
        notes.forEach(([f, d]) => {
          this.tone(f, 0.5, 'sawtooth', 0.05, null, d, 1800);
          this.tone(f * 1.005, 0.5, 'sawtooth', 0.04, null, d, 1800);
        });
        [523, 659, 784].forEach((f) => this.tone(f, 1.4, 'triangle', 0.05, null, 0.72));
        for (let k = 0; k < 6; k++) this.tone(70, 0.25, 'sine', 0.16, 50, k * 0.12);
      });
    },
    horn() {
      this.play('horn', 1, () => {
        this.tone(110, 1.1, 'sawtooth', 0.07, 98, 0, 600);
        this.tone(165, 1.1, 'sawtooth', 0.05, 147, 0.05, 600);
      });
    },
    alarm() {
      this.play('alarm', 0.8, () => {
        [0, 0.22, 0.44].forEach((d) => this.tone(660, 0.16, 'square', 0.035, 520, d, 2400));
      });
    },
    special() { this.play('special', 0.5, () => this.tone(180, 0.6, 'sawtooth', 0.06, 900, 0, 2600)); },
    ultimate(age) {
      this.play('ult', 0.5, () => {
        if (age === 0) this.noise(1.6, 0.3, 2000, 0, 'lowpass', 120);
        else if (age === 1) { this.tone(140, 0.3, 'square', 0.05, 70, 0, 600); this.noise(0.3, 0.2, 800, 0.05); }
        else if (age === 2) { for (let k = 0; k < 4; k++) this.tone(2200, 0.7, 'sine', 0.035, 500, k * 0.25); }
        else { this.tone(55, 2.6, 'sawtooth', 0.12, 80, 0, 900); this.tone(880, 2.6, 'sine', 0.04, 440); }
        this.tone(60, 0.8, 'sine', 0.2, 30);
      });
    },
    whistle() { this.play('whistle', 0.12, () => this.tone(2400, 0.45, 'sine', 0.025, 700)); },
    win() {
      this.play('end', 1, () => {
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.09, null, i * 0.14));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, 1.6, 'sawtooth', 0.025, null, 0.6, 2000));
      });
    },
    lose() {
      this.play('end', 1, () => {
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.05, null, i * 0.2, 1400));
      });
    },
    blip() { this.play('blip', 0.03, () => this.tone(600 + Math.random() * 300, 0.03, 'square', 0.015)); },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  // Pointer and placement/aiming state for the player's HUD.
  const ui = { mode: null, mx: -1, my: -1 };

  // Crack lines for a castle, picked once so they don't flicker.
  function makeCracks() {
    const r = Math.random;
    const cracks = [];
    for (let k = 0; k < 7; k++) {
      let x = 10 + r() * (BASE_W - 20);
      let y = 20 + r() * (BASE_H - 30);
      const pts = [[x, y]];
      for (let j = 0; j < 4; j++) {
        x += (r() - 0.5) * 16;
        y += 6 + r() * 9;
        pts.push([x, y]);
      }
      cracks.push(pts);
    }
    return cracks;
  }

  function newSide(i, ai, persona, bonus) {
    return {
      i, ai,
      persona: PERSONAS[persona],
      bonus,
      dir: i === 0 ? 1 : -1,
      age: 0,
      gold: 175,
      xp: 0,
      level: 0,
      hp: AGES[0].baseHp,
      maxHp: AGES[0].baseHp,
      queue: [],
      trainT: 0,
      trained: [0, 0, 0],
      turrets: [null, null, null],
      open: [true, false, false],
      specialCd: 20,
      ult: 0,
      ultUsed: 0,
      thinkT: 1,
      hitFlash: 0,
      kills: 0,
      rebuild: 1, // 0..1 while the castle rebuilds into a new age
      prevAge: 0,
      cracks: makeCracks(),
      smokeT: 0,
      dmgDealt: 0,
    };
  }

  // kind: 'skirmish' (difficulty), 'campaign' (stage) or 'demo' (menu backdrop).
  function newGame(opts) {
    const kind = opts.kind;
    const gen = kind === 'campaign' ? GENERALS[opts.stage] : null;
    let bonus = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    if (gen) bonus = { gold: gen.gold, xp: gen.xp, think: gen.think, special: gen.special };
    const demo = kind === 'demo';
    state = {
      mode: demo ? 'menu' : 'playing',
      kind,
      stage: gen ? opts.stage : -1,
      general: gen,
      difficulty: opts.difficulty || save.difficulty,
      t: 0,
      sides: [
        newSide(0, AUTOPLAY || demo, 'balanced', demo ? DIFFICULTY.normal : null),
        newSide(1, true, gen ? gen.persona : 'balanced', bonus),
      ],
      units: [],
      shots: [],
      drops: [],
      strikes: [],
      bolts: [],
      corpses: [],
      parts: [],
      texts: [],
      decals: [],
      shake: 0,
      flash: 0,
      flashColor: '#fff',
      bars: 0, // cinematic letterbox, 0..1
      cards: [],
      speech: null,
      hint: null,
      hintT: 30,
      overtime: false,
      sweep: null,
      ending: null,
      winner: null,
      result: null,
      intro: null,
      tut: null,
      taunted: {},
    };
    ui.mode = null;
    if (demo) {
      // The menu backdrop: a battle already raging in a random age.
      const age = (Math.random() * AGES.length) | 0;
      for (const s of state.sides) {
        s.age = s.prevAge = age;
        s.hp = s.maxHp = AGES[age].baseHp;
        s.gold = 400 * AGES[age].costMult;
        s.open = [true, true, age > 1];
        s.ult = Math.random() * 0.8;
      }
    }
  }

  // Simulation and AI actions work during play and in the menu's demo battle.
  const live = () => state && (state.mode === 'playing' || state.mode === 'menu');
  const showy = () => state.kind !== 'demo'; // cards, speech and hints

  // ---------------------------------------------------------------------------
  // Actions (used by both the player and the AI)
  // ---------------------------------------------------------------------------

  function deny(side) {
    if (!side.ai) Sound.deny();
    return false;
  }

  function train(side, t) {
    if (!live()) return false;
    const cost = unitCost(side, t);
    if (side.queue.length >= MAX_QUEUE || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.queue.push({ t, age: side.age });
    side.trained[t]++;
    if (!side.ai) Sound.click();
    return true;
  }

  // Build a turret in a slot. An occupied slot holding an older-age turret is
  // replaced, with the old turret's refund counted towards the price.
  function buildTurret(side, slot) {
    if (!live() || !side.open[slot]) return deny(side);
    const old = side.turrets[slot];
    if (old && old.age >= side.age) return deny(side);
    const refund = old ? Math.round(old.cost * 0.5) : 0;
    const cost = turretCost(side);
    if (side.gold + refund < cost) return deny(side);
    side.gold += refund - cost;
    side.turrets[slot] = { age: side.age, cd: 0.5, cost, aim: side.i === 0 ? 0 : Math.PI, kick: 0, pop: 0.4 };
    const p = turretPos(side, slot);
    burst(p.x, p.y, AGES[side.age].glow, fx(14), 140);
    puff(p.x, p.y + 6, 5, '#d6d3d1');
    if (!side.ai) Sound.click();
    return true;
  }

  function unlockSlot(side, slot) {
    const cost = unlockCost(side);
    if (!live() || side.open[slot] || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.open[slot] = true;
    const p = turretPos(side, slot);
    burst(p.x, p.y, '#facc15', fx(10), 110);
    if (!side.ai) Sound.click();
    return true;
  }

  function sellTurret(side, slot) {
    const tur = side.turrets[slot];
    if (!live() || !tur) return deny(side);
    const refund = Math.round(tur.cost * 0.5);
    side.gold += refund;
    side.turrets[slot] = null;
    const p = turretPos(side, slot);
    addText(p.x, p.y - 10, `+${refund}`, '#facc15');
    puff(p.x, p.y, 4, '#a8a29e');
    if (!side.ai) Sound.click();
    return true;
  }

  function castSpecial(side) {
    if (!live() || side.specialCd > 0) return deny(side);
    side.specialCd = SPECIAL.cooldown * (side.persona.specialCd || 1);
    const enemies = state.units.filter((u) => u.side !== side.i);
    const lo = side.i === 0 ? LANE_L + 120 : LANE_L + 10;
    const hi = side.i === 0 ? LANE_R - 10 : LANE_R - 120;
    for (let k = 0; k < SPECIAL.count; k++) {
      let x = rand(lo, hi);
      if (enemies.length && Math.random() < 0.7) {
        x = clamp(enemies[(Math.random() * enemies.length) | 0].x + rand(-40, 40), lo, hi);
      }
      state.drops.push({
        x, y: -30, vy: 0, vx: side.dir * rand(20, 60),
        delay: (k / SPECIAL.count) * SPECIAL.duration + rand(0, 0.15),
        side: side.i, age: side.age, trail: [],
      });
    }
    Sound.special();
    return true;
  }

  // Where a side may aim its ultimate: anywhere on the enemy's half and beyond.
  function ultRange(side) {
    return side.i === 0 ? [ULT_MIN, ULT_MAX] : [W - ULT_MAX, W - ULT_MIN];
  }

  function castUltimate(side, x) {
    if (!live() || side.ult < 1) return deny(side);
    const [lo, hi] = ultRange(side);
    side.ult = 0;
    side.ultUsed++;
    state.strikes.push({ side: side.i, age: side.age, x: clamp(x, lo, hi), t: -ULT.windup, n: 0 });
    Sound.alarm();
    if (showy()) {
      if (side.i === 0) addCard(AGES[side.age].ult, '', 'ult');
      else say(side, 'ult');
    }
    return true;
  }

  // The x that catches the most enemy value inside the ultimate's reach.
  function bestUltTarget(side) {
    const [lo, hi] = ultRange(side);
    let best = null;
    let bestV = 0;
    for (const u of state.units) {
      if (u.side === side.i || u.dead) continue;
      const x = clamp(u.x + side.dir * 30, lo, hi);
      let v = 0;
      for (const e of state.units) {
        if (e.side !== side.i && !e.dead && Math.abs(e.x - x) < ULT.radius) v += e.cost;
      }
      if (v > bestV) { bestV = v; best = x; }
    }
    return best === null ? null : { x: best, v: bestV };
  }

  function upgrade(side) {
    const cost = upgradeCost(side);
    if (!live() || side.gold < cost) return deny(side);
    side.gold -= cost;
    side.level++;
    addText(baseCenter(side), GROUND - BASE_H - 30, `Army Lv ${side.level}`, '#fff', 1.2);
    burst(baseCenter(side), GROUND - BASE_H / 2, '#4ade80', fx(16), 160);
    if (!side.ai) Sound.click();
    return true;
  }

  const fieldKey = () => `${state.sides[0].age}-${state.sides[1].age}`;

  function evolve(side) {
    if (!live() || !canEvolve(side)) return deny(side);
    const from = fieldKey();
    side.prevAge = side.age;
    side.age++;
    const max = AGES[side.age].baseHp;
    side.hp += max - side.maxHp;
    side.maxHp = max;
    side.rebuild = 0;
    side.cracks = makeCracks();
    // The battlefield behind this side sweeps into the new era.
    state.sweep = { side: side.i, t: 0, dur: 1.6, from };
    const cx = baseCenter(side);
    burst(cx, GROUND - BASE_H / 2, AGES[side.age].glow, fx(50), 300);
    puff(cx, GROUND - 10, fx(12), '#d6d3d1', 60);
    if (!showy()) return true;
    const a = AGES[side.age];
    if (side.i === 0) {
      addCard(a.name, `${a.units.join(' · ')} · ${a.turret} · ${a.ult}`, 'age');
      state.flash = save.effects === 'full' ? 0.7 : 0;
      state.flashColor = '#fff';
      state.bars = Math.max(state.bars, 0.01);
      Sound.fanfare();
      Sound.whoosh();
    } else {
      addCard(`${enemyName()} enters the ${a.name}`, a.tagline, 'enemy');
      say(side, 'evolve');
      Sound.horn();
    }
    shake(6);
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
      dustT: rand(0, 0.3),
      moving: false,
      dead: false,
      enter: 0.25, // fades in at the gate
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
      tur.kick = Math.max(0, tur.kick - dt * 5);
      tur.pop = Math.max(0, tur.pop - dt);
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
        tur.kick = 1;
        const mx = p.x + Math.cos(tur.aim) * 18;
        const my = p.y + Math.sin(tur.aim) * 18;
        fire(mx, my, target, side.i, TURRET.dmg * AGES[tur.age].mult * power(side), tur.age, true);
        if (tur.age >= 2) flashAt(mx, my, tur.age === 3 ? AGES[3].glow : '#fde68a', 12);
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
      u.enter = Math.max(0, u.enter - dt);
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
          const mx = u.x + u.dir * u.w / 2;
          const my = GROUND - u.h * 0.7;
          fire(mx, my, target, u.side, u.dmg, u.age, false, u.t);
          if (u.age >= 2) flashAt(mx + u.dir * 8, my, u.age === 3 ? AGES[3].glow : '#fde68a', 6);
        } else {
          const hx = u.x + u.dir * (u.w / 2 + 2);
          const hy = GROUND - u.h * 0.6;
          if (target === enemySide) hurtBase(enemySide, u.dmg, u.side);
          else hurtUnit(target, u.dmg * counterMult(u.t, target), u.side);
          sparks(hx, hy, u.dir, u.age === 3 ? AGES[3].glow : '#fff7d6', fx(u.t === 2 ? 8 : 5));
          Sound.hit(u.t === 2);
        }
      }

      u.moving = !blocked;
      if (!blocked) {
        u.x += u.dir * u.speed * dt;
        u.walk += dt * u.speed * 0.22;
        // Kick up dust while marching.
        u.dustT -= dt;
        if (u.dustT <= 0) {
          u.dustT = (u.t === 2 ? 0.18 : 0.32) * (save.effects === 'reduced' ? 2.5 : 1) * rand(0.8, 1.2);
          if (u.age < 3 || u.t !== 2) dust(u.x - u.dir * u.w * 0.4, u.t === 2 ? 1.4 : 1);
        }
      }
      u.x = clamp(u.x, LANE_L + u.w / 2, LANE_R - u.w / 2);
    }
    state.units = units.filter((u) => !u.dead);
  }

  const counterMult = (ut, target) => (ut !== undefined && target.t !== undefined && BEATS[ut] === target.t ? COUNTER : 1);

  function aimPoint(target) {
    if (target.i !== undefined) {
      return { x: target.i === 0 ? LANE_L - 12 : LANE_R + 12, y: GROUND - BASE_H * 0.45 };
    }
    return { x: target.x, y: GROUND - target.h * 0.55 };
  }

  // Projectiles fly along a (possibly arcing) path that homes on the target.
  function fire(x, y, target, side, dmg, age, turret, ut) {
    const p = aimPoint(target);
    const dist = Math.hypot(p.x - x, p.y - y);
    const speed = turret ? 520 : 430;
    const arcK = age === 0 ? 0.26 : age === 1 ? 0.2 : age === 2 && turret ? 0.1 : 0;
    state.shots.push({
      x0: x, y0: y, x, y, tx: p.x, ty: p.y, p: 0,
      dur: Math.max(0.1, dist / speed), arc: dist * arcK,
      target, side, dmg, age, turret, ut, trail: [], ang: 0,
    });
    Sound.shoot(age);
  }

  function updateShots(dt) {
    for (const s of state.shots) {
      const alive = s.target.i !== undefined || !s.target.dead;
      if (alive) {
        const p = aimPoint(s.target);
        s.tx = p.x;
        s.ty = p.y;
      }
      s.p += dt / s.dur;
      const q = Math.min(1, s.p);
      const nx = s.x0 + (s.tx - s.x0) * q;
      const ny = s.y0 + (s.ty - s.y0) * q - s.arc * Math.sin(Math.PI * q);
      s.trail.push(s.x, s.y);
      if (s.trail.length > 14) s.trail.splice(0, 2);
      s.ang = Math.atan2(ny - s.y, nx - s.x);
      s.x = nx;
      s.y = ny;
      if (s.p < 1) continue;
      s.done = true;
      if (!alive) { puff(s.x, Math.min(s.y, GROUND - 2), 1, '#a8a29e'); continue; }
      if (s.target.i !== undefined) hurtBase(s.target, s.dmg, s.side);
      else hurtUnit(s.target, s.dmg * counterMult(s.ut, s.target), s.side);
      sparks(s.x, s.y, Math.cos(s.ang) > 0 ? 1 : -1, AGES[s.age].glow, fx(s.turret ? 8 : 5));
      if (s.turret && s.age === 2) {
        flashAt(s.x, s.y, '#fdba74', 18);
        puff(s.x, s.y, 2, '#78716c');
      }
    }
    state.shots = state.shots.filter((s) => !s.done);
  }

  function updateDrops(dt) {
    for (const d of state.drops) {
      d.delay -= dt;
      if (d.delay > 0) continue;
      d.trail.push(d.x, d.y);
      if (d.trail.length > 12) d.trail.splice(0, 2);
      d.vy += 1100 * dt;
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      if (d.y < GROUND) continue;
      d.done = true;
      const dmg = SPECIAL.dmg * AGES[d.age].mult;
      for (const u of state.units) {
        if (u.side !== d.side && !u.dead && Math.abs(u.x - d.x) < SPECIAL.radius + u.w / 2) {
          hurtUnit(u, dmg, d.side, { knock: 1.3 });
        }
      }
      burst(d.x, GROUND - 4, AGES[d.age].glow, fx(12), 200);
      burst(d.x, GROUND - 4, '#57534e', fx(6), 140);
      flashAt(d.x, GROUND - 6, AGES[d.age].glow, 26);
      puff(d.x, GROUND - 6, fx(3), '#78716c');
      decal(d.x, 26);
      shake(3);
      Sound.boom();
    }
    state.drops = state.drops.filter((d) => !d.done);
  }

  // Ultimates: a windup with a targeting reticle, then the strike itself.
  function updateStrikes(dt) {
    for (const s of state.strikes) {
      s.t += dt;
      if (s.t < 0) continue;
      const caster = state.sides[s.side];
      const u = ULTS[s.age];
      if (!s.started) {
        s.started = true;
        Sound.ultimate(s.age);
        if (s.age === 3) {
          state.flash = save.effects === 'full' ? 0.35 : 0;
          state.flashColor = AGES[3].glow;
        }
      }
      if (s.age === 3) {
        // Orbital laser: a beam sweeping across the target zone.
        const p = s.t / u.dur;
        s.bx = s.x + caster.dir * ULT.radius * (p * 2 - 1);
        const dmg = u.dps * AGES[3].mult * dt;
        for (const e of state.units) {
          if (e.side !== s.side && !e.dead && Math.abs(e.x - s.bx) < u.width / 2 + e.w / 2) {
            hurtUnit(e, dmg, s.side, { quiet: true, knock: 2 });
          }
        }
        const enemy = state.sides[1 - s.side];
        if (Math.abs(s.bx - front(enemy)) < u.width) hurtBase(enemy, dmg * ULT.castle, s.side);
        sparks(s.bx, GROUND - 2, -1, '#a5f3fc', fx(2));
        sparks(s.bx, GROUND - 2, 1, '#ffffff', fx(2));
        if (Math.random() < dt * 14) decal(s.bx, 20, true);
        if (Math.random() < dt * 10) puff(s.bx, GROUND - 4, 1, '#475569');
        shake(4);
        if (p >= 1) s.done = true;
      } else {
        while (s.n < u.count && s.t >= s.n * u.gap) {
          launchBolt(s, caster);
          s.n++;
        }
        if (s.n >= u.count) s.done = true;
      }
    }
    state.strikes = state.strikes.filter((s) => !s.done);
  }

  function launchBolt(s, caster) {
    const tx = s.x + rand(-1, 1) * (ULT.radius - 18);
    let sx;
    let sy;
    let dur;
    let arc = 0;
    if (s.age === 0) {
      sx = tx - caster.dir * rand(220, 340);
      sy = -60;
      dur = rand(0.65, 0.85);
    } else if (s.age === 1) {
      sx = baseCenter(caster) + rand(-10, 10);
      sy = GROUND - BASE_H - 6;
      const d = Math.abs(tx - sx);
      dur = 0.9 + d / 1500;
      arc = 160 + d * 0.22;
      flashAt(sx, sy, '#fdba74', 14);
    } else {
      sx = tx + rand(-30, 30);
      sy = -40;
      dur = 0.5;
      Sound.whistle();
    }
    state.bolts.push({ side: s.side, age: s.age, sx, sy, tx, x: sx, y: sy, t: 0, dur, arc, trail: [] });
  }

  function updateBolts(dt) {
    for (const b of state.bolts) {
      b.t += dt;
      const q = Math.min(1, b.t / b.dur);
      b.trail.push(b.x, b.y);
      if (b.trail.length > 20) b.trail.splice(0, 2);
      const qq = b.age === 1 ? q : q * q; // things falling from the sky accelerate
      const nx = b.sx + (b.tx - b.sx) * qq;
      const ny = b.sy + (GROUND - b.sy) * qq - b.arc * Math.sin(Math.PI * q);
      b.ang = Math.atan2(ny - b.y, nx - b.x);
      b.x = nx;
      b.y = ny;
      if (b.age !== 2 && Math.random() < 0.8) ember(b.x, b.y);
      if (q < 1) continue;
      b.done = true;
      const u = ULTS[b.age];
      explode(b.tx, b.side, b.age, u.radius, u.dmg * AGES[b.age].mult);
    }
    state.bolts = state.bolts.filter((b) => !b.done);
  }

  function explode(x, sideI, age, radius, dmg) {
    for (const u of state.units) {
      if (u.side !== sideI && !u.dead && Math.abs(u.x - x) < radius + u.w / 2) {
        hurtUnit(u, dmg, sideI, { knock: 2.2 });
      }
    }
    const enemy = state.sides[1 - sideI];
    if (Math.abs(x - front(enemy)) < radius + 10) hurtBase(enemy, dmg * ULT.castle, sideI);
    const glow = age === 0 ? '#f97316' : age === 1 ? '#fb923c' : '#fde047';
    flashAt(x, GROUND - 10, glow, radius * 1.4);
    burst(x, GROUND - 6, glow, fx(18), 320);
    burst(x, GROUND - 6, '#44403c', fx(10), 240);
    puff(x, GROUND - 10, fx(6), '#57534e', 50);
    for (let k = 0; k < fx(6); k++) ember(x + rand(-20, 20), GROUND - rand(0, 20));
    decal(x, radius * 0.8);
    shake(9);
    Sound.boom(true);
  }

  function hurtUnit(u, amount, fromSide, opts = {}) {
    if (u.dead) return;
    u.hp -= amount;
    u.flash = 0.1;
    u.x -= u.dir * Math.min(8, (amount / u.maxHp) * 30);
    const killer = state.sides[fromSide];
    killer.dmgDealt += amount;
    if (!opts.quiet) {
      const big = amount >= u.maxHp * 0.5;
      addText(u.x + rand(-8, 8), GROUND - u.h - rand(10, 24), Math.round(amount), fromSide === 0 ? '#fde047' : '#fecaca', 0.7, big ? 1.35 : 1);
    }
    if (u.hp > 0) return;

    u.dead = true;
    const bonus = aiBonus(killer);
    const gold = Math.round(u.cost * KILL_GOLD * (bonus ? bonus.gold : 1));
    killer.gold += gold;
    killer.xp += u.xp;
    killer.kills++;
    chargeUlt(killer, u.cost / (ULT.charge * AGES[killer.age].costMult) * (killer.persona.charge || 1));
    if (!killer.ai || (AUTOPLAY && fromSide === 0)) addText(u.x, GROUND - u.h - 30, `+${gold}`, '#facc15', 1);
    ragdoll(u, opts.knock || 1);
    burst(u.x, GROUND - u.h / 2, SIDE_COLORS[u.side].body, fx(10), 170);
    if (u.t === 2 && u.age >= 2) {
      // Machines blow apart.
      flashAt(u.x, GROUND - u.h / 2, '#fb923c', 30);
      burst(u.x, GROUND - u.h / 2, '#1c1917', fx(10), 220);
      puff(u.x, GROUND - u.h / 2, fx(3), '#57534e');
      Sound.boom();
    }
    Sound.death();
  }

  function chargeUlt(side, amount) {
    if (side.ult >= 1) return;
    side.ult = Math.min(1, side.ult + amount);
    if (side.ult >= 1 && side.i === 0 && showy()) {
      Sound.ready();
      addText(W / 2, BAR + 50, `${AGES[side.age].ult} ready! (R)`, '#fde047', 1.8, 1.4);
    }
  }

  const overtimeMult = () => (state.t > OVERTIME && state.kind !== 'demo' ? 1 + ((state.t - OVERTIME) / 60) * OVERTIME_RAMP : 1);

  function hurtBase(side, amount, fromSide) {
    if (!live()) return;
    amount *= overtimeMult();
    const before = side.hp / side.maxHp;
    side.hp -= amount;
    side.hitFlash = 0.12;
    state.sides[fromSide].xp += amount * 0.05;
    state.sides[fromSide].dmgDealt += amount;
    chargeUlt(side, (amount / side.maxHp) * ULT.castleCharge);
    if (side.i === 0) shake(4);
    // Chips of masonry fly off.
    if (Math.random() < 0.5) {
      const x = side.i === 0 ? LANE_L - 6 : LANE_R + 6;
      burst(x, GROUND - rand(20, BASE_H - 10), AGES[side.age].metal, fx(3), 120);
    }
    Sound.base();
    if (state.kind === 'demo') {
      side.hp = Math.max(side.hp, side.maxHp * 0.35);
      return;
    }
    const after = side.hp / side.maxHp;
    for (const mark of [0.5, 0.25]) {
      if (before > mark && after <= mark) {
        // A big chunk breaks off.
        const cx = baseCenter(side);
        burst(cx, GROUND - BASE_H * 0.7, AGES[side.age].metal, fx(24), 240);
        puff(cx, GROUND - BASE_H * 0.6, fx(6), '#57534e', 40);
        shake(7);
        Sound.boom(true);
        if (side.i === 1 && mark === 0.25) say(side, 'hurt');
        if (side.i === 0 && mark === 0.5) say(state.sides[1], 'winning');
      }
    }
    if (side.hp <= 0) {
      side.hp = 0;
      endGame(1 - side.i);
    }
  }

  function aiThink(side, dt) {
    side.thinkT -= dt;
    if (side.thinkT > 0) return;
    const bonus = aiBonus(side);
    const P = side.persona;
    side.thinkT = rand(0.5, 1.2) * (bonus ? bonus.think : 1);
    // During the first steps of the tutorial the enemy only watches.
    if (side.i === 1 && state.tut && state.tut.step < 3 && state.t < 45) return;

    if (canEvolve(side)) { evolve(side); return; }

    const enemies = state.units.filter((u) => u.side !== side.i);
    const near = enemies.filter((u) => Math.abs(u.x - front(side)) < 350).length;

    if (side.ult >= 1) {
      const tgt = bestUltTarget(side);
      const need = P.ultValue * TYPES[0].cost * AGES[side.age].costMult;
      const danger = enemies.some((u) => Math.abs(u.x - front(side)) < 140);
      if (tgt && (tgt.v >= need || (danger && tgt.v >= need * 0.4))) {
        castUltimate(side, tgt.x);
        return;
      }
    }

    // Minimum number of nearby enemies before the AI uses its special (0 = never).
    const specialAt = bonus ? bonus.special : 4;
    if (specialAt && side.specialCd <= 0 && near >= specialAt) castSpecial(side);

    // Turrets: fill the highest open slot, open more slots later, replace old ones.
    const tc = turretCost(side);
    let empty = -1;
    for (let k = SLOTS.length - 1; k >= 0; k--) {
      if (side.open[k] && !side.turrets[k]) { empty = k; break; }
    }
    if (state.t > P.turretAt && empty >= 0 && side.gold >= tc * P.turretGold) {
      buildTurret(side, empty);
      return;
    }
    const locked = side.open.indexOf(false);
    if (state.t > P.slotsAt && empty < 0 && locked >= 0 && side.gold >= unlockCost(side) * 2 + tc) {
      unlockSlot(side, locked);
      return;
    }
    const old = side.turrets.findIndex((t) => t && t.age < side.age);
    if (old >= 0 && side.gold >= tc * 2.2) {
      buildTurret(side, old);
      return;
    }

    const reserve = unitCost(side, 2) * 2;
    if (side.gold >= upgradeCost(side) + reserve && (side.queue.length >= 3 || Math.random() < P.upgrade)) {
      upgrade(side);
      return;
    }

    if (side.queue.length >= P.queue) return;
    let t = pickWeighted([P.melee, P.ranged, side.gold >= unitCost(side, 2) * 1.4 ? P.heavy : 0]);
    // Smart generals counter whatever the enemy fields most.
    if (Math.random() < P.smart && enemies.length >= 3) {
      const count = [0, 0, 0];
      for (const e of enemies) count[e.t]++;
      const most = count.indexOf(Math.max(...count));
      const counter = BEATS.indexOf(most);
      if (counter !== 2 || side.gold >= unitCost(side, 2)) t = counter;
    }
    train(side, t);
  }

  function pickWeighted(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let k = 0; k < weights.length; k++) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 0;
  }

  function step(dt) {
    state.t += dt;
    if (!state.overtime && state.t >= OVERTIME && state.kind !== 'demo') {
      state.overtime = true;
      addCard('Overtime', 'The castles are crumbling: they take more damage every minute', 'enemy');
      Sound.horn();
    }
    for (const side of state.sides) {
      const bonus = aiBonus(side);
      side.gold += 1.5 * AGES[side.age].costMult * (bonus ? bonus.gold : 1) * dt;
      side.xp += (1 + (bonus ? bonus.xp : 0)) * (side.persona.xpMult || 1) * dt;
      side.specialCd = Math.max(0, side.specialCd - dt);
      side.hitFlash -= dt;
      side.rebuild = Math.min(1, side.rebuild + dt / 1.8);
      if (side.ai) aiThink(side, dt);
      updateTraining(side, dt);
      updateTurrets(side, dt);
    }
    updateUnits(dt);
    updateShots(dt);
    updateDrops(dt);
    updateStrikes(dt);
    updateBolts(dt);
    if (state.tut) updateTutorial(dt);
    if (showy()) updateHints(dt);
  }

  function endGame(winner) {
    if (state.mode !== 'playing') return;
    state.mode = 'ending';
    state.winner = winner;
    ui.mode = null;
    const loser = state.sides[1 - winner];
    state.ending = { t: 0, x: baseCenter(loser), loser: loser.i, booms: 0, jingle: false };
    state.shake = save.shake ? 16 : 0;
    state.flash = save.effects === 'full' ? 0.8 : 0;
    state.flashColor = '#fff7ed';
    state.strikes = [];
    Sound.crumble();
    Sound.boom(true);
    if (state.kind === 'campaign') {
      const me = state.sides[0];
      const g = state.general;
      const won = winner === 0;
      const stars = [won, won && me.hp / me.maxHp >= 0.5, won && state.t <= g.par];
      const n = stars.filter(Boolean).length;
      const best = save.stars[state.stage];
      state.result = { stars, n, best: Math.max(best, n), improved: n > best };
      if (n > best) {
        save.stars[state.stage] = n;
        storeSave();
      }
    }
  }

  // The slow-motion collapse of the losing castle before the results screen.
  function updateEnding(real) {
    const e = state.ending;
    e.t += real;
    while (e.booms < 10 && e.t > e.booms * 0.24) {
      const x = e.x + rand(-40, 40);
      const y = GROUND - rand(10, BASE_H + 20);
      flashAt(x, y, '#fdba74', 40);
      burst(x, y, '#f97316', fx(16), 260);
      burst(x, y, AGES[state.sides[e.loser].age].metal, fx(8), 200);
      puff(x, y, fx(4), '#44403c', 50);
      shake(8);
      if (e.booms % 2 === 0) Sound.boom(true);
      e.booms++;
    }
    if (e.t > 0.8 && Math.random() < real * 30) puff(e.x + rand(-55, 55), GROUND - rand(0, 30), 1, '#a8a29e', 60);
    if (!e.jingle && e.t > 1.2) {
      e.jingle = true;
      if (state.winner === 0) Sound.win();
      else Sound.lose();
      addCard(state.winner === 0 ? 'Victory' : 'Defeat', '', state.winner === 0 ? 'win' : 'lose');
    }
    if (e.t >= 3.6) {
      state.mode = 'over';
      state.cards = []; // the results overlay takes over from the title card
      showOverlay('over');
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function addPart(p) {
    state.parts.push(p);
  }

  // Chunky debris that falls and bounces.
  function burst(x, y, color, n, power) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.3, 1) * power;
      addPart({
        kind: 'sq', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3,
        life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 4),
      });
    }
  }

  // Bright streaks thrown away from a hit.
  function sparks(x, y, dir, color, n) {
    for (let k = 0; k < n; k++) {
      const a = rand(-1.1, 1.1) + (dir > 0 ? 0 : Math.PI);
      const v = rand(120, 320);
      addPart({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rand(0.12, 0.28), max: 0.28, color, size: 1.6 });
    }
  }

  // Soft smoke that grows and drifts upwards.
  function puff(x, y, n, color, size = 26) {
    for (let k = 0; k < n; k++) {
      addPart({
        kind: 'puff', x: x + rand(-10, 10), y: y + rand(-6, 6), vx: rand(-18, 18), vy: rand(-36, -10),
        life: rand(0.8, 1.6), max: 1.6, color, size: size * rand(0.5, 1),
      });
    }
  }

  function dust(x, scale) {
    addPart({
      kind: 'puff', x: x + rand(-3, 3), y: GROUND - 3, vx: rand(-10, 10), vy: rand(-14, -4),
      life: rand(0.4, 0.7), max: 0.7, color: '#c8b49a', size: 10 * scale, alpha: 0.35,
    });
  }

  function flashAt(x, y, color, r) {
    if (save.effects === 'reduced' && r < 30) return;
    addPart({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, color, size: r });
  }

  function ember(x, y) {
    addPart({
      kind: 'ember', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-30, 30), vy: rand(-60, -10),
      life: rand(0.3, 0.8), max: 0.8, color: Math.random() < 0.5 ? '#fde047' : '#f97316', size: rand(1.5, 3),
    });
  }

  // Scorch marks left on the ground by explosions.
  function decal(x, r, glow) {
    state.decals.push({ x, r: r * rand(0.8, 1.1), life: 14, max: 14, glow: glow ? 1.5 : 1 });
    if (state.decals.length > 40) state.decals.shift();
  }

  function shake(n) {
    if (save.shake) state.shake = Math.max(state.shake, n);
  }

  function addText(x, y, text, color, life = 0.8, scale = 1) {
    state.texts.push({ x, y, text: String(text), color, life, max: life, scale });
    if (state.texts.length > 70) state.texts.shift();
  }

  // Ragdoll-ish death: the body is thrown back, tumbles and bounces.
  function ragdoll(u, knock) {
    const k = Math.min(2.4, knock);
    state.corpses.push({
      side: u.side, dir: u.dir, age: u.age, t: u.t, w: u.w, h: u.h, range: u.range,
      x: u.x, y: 0, vx: -u.dir * rand(40, 110) * k, vy: rand(120, 220) * Math.min(1.7, k),
      rot: 0, vr: -u.dir * rand(3, 7) * Math.min(1.6, k), life: 2.4, ground: false,
    });
    if (state.corpses.length > 40) state.corpses.shift();
  }

  function addCard(title, sub, kind) {
    if (AUTOPLAY && kind !== 'win' && kind !== 'lose' && SPEED > 2) return;
    state.cards = state.cards.filter((c) => c.kind !== kind && !(kind === 'age' && c.kind === 'ult'));
    const dur = { age: 3, ult: 1.5, enemy: 2.6, fight: 1.3, win: 99, lose: 99 }[kind] || 2;
    state.cards.push({ title, sub, kind, t: 0, dur });
  }

  // A line of dialogue from the rival general, shown beside their portrait.
  function say(side, key) {
    if (!state.general || side.i !== 1 || !showy()) return;
    const text = state.general.taunts[key];
    if (text) state.speech = { text, t: 0, dur: 3.6 };
  }

  function updateEffects(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      if (p.kind === 'puff') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt;
      } else if (p.kind === 'ember') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 20 * dt;
      } else if (p.kind !== 'flash') {
        p.vy += (p.kind === 'spark' ? 400 : 600) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > GROUND) { p.y = GROUND; p.vy *= -0.3; p.vx *= 0.6; }
      }
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    const cap = save.effects === 'reduced' ? 260 : 800;
    if (state.parts.length > cap) state.parts.splice(0, state.parts.length - cap);

    for (const c of state.corpses) {
      c.life -= dt;
      if (!c.ground) {
        c.vy -= 900 * dt;
        c.y += c.vy * dt;
        c.x += c.vx * dt;
        c.rot += c.vr * dt;
        if (c.y <= 0) {
          c.y = 0;
          if (c.vy < -80) {
            c.vy = -c.vy * 0.3;
            c.vx *= 0.55;
            c.vr *= 0.5;
            dust(c.x, 1);
          } else {
            c.ground = true;
          }
        }
      } else {
        // Settle flat on the ground.
        c.x += c.vx * dt;
        c.vx *= Math.max(0, 1 - dt * 8);
        const lie = -c.dir * Math.PI / 2;
        c.rot += (lie - c.rot) * Math.min(1, dt * 8);
      }
      c.x = clamp(c.x, 0, W);
    }
    state.corpses = state.corpses.filter((c) => c.life > 0);

    for (const d of state.decals) d.life -= dt;
    state.decals = state.decals.filter((d) => d.life > 0);

    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 30 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);

    for (const c of state.cards) c.t += dt;
    state.cards = state.cards.filter((c) => c.t < c.dur);
    if (state.speech) {
      state.speech.t += dt;
      if (state.speech.t > state.speech.dur) state.speech = null;
    }
    // Letterbox bars slide in for the age-up cinematic and the final blow.
    const wantBars = state.mode === 'intro' || state.mode === 'ending' || state.cards.some((c) => c.kind === 'age' && c.t < 2.4);
    state.bars = clamp(state.bars + (wantBars ? dt : -dt) * 2.5, 0, 1);
    if (state.sweep) {
      state.sweep.t += dt;
      if (state.sweep.t >= state.sweep.dur) state.sweep = null;
    }

    // Damaged castles smoke, badly damaged ones burn.
    for (const side of state.sides) {
      const f = side.hp / side.maxHp;
      if (f > 0.5 || state.mode === 'menu') continue;
      side.smokeT -= dt;
      if (side.smokeT > 0) continue;
      side.smokeT = (f < 0.25 ? 0.12 : 0.3) * (save.effects === 'reduced' ? 3 : 1);
      const x = baseCenter(side) + rand(-BASE_W / 2, BASE_W / 2);
      const y = GROUND - BASE_H * rand(0.6, 1);
      puff(x, y, 1, f < 0.25 ? '#292524' : '#78716c', 22);
      if (f < 0.25) ember(x, y + 4);
    }

    // Sparks fly from the seam of a castle being rebuilt.
    for (const side of state.sides) {
      if (side.rebuild >= 1 || Math.random() > dt * 40) continue;
      const cut = GROUND - (BASE_H + 100) * ease(side.rebuild);
      sparks(baseCenter(side) + rand(-BASE_W / 2, BASE_W / 2), cut, Math.random() < 0.5 ? 1 : -1, AGES[side.age].glow, 2);
    }

    state.shake = Math.max(0, state.shake - dt * 25);
    state.flash = Math.max(0, state.flash - dt * 1.6);
  }

  // ---------------------------------------------------------------------------
  // Tutorial and battle tips
  // ---------------------------------------------------------------------------

  const TUTORIAL = [
    { target: 'unit0', text: 'Train a Clubber: click the glowing tile or press 1.', done: (me) => me.trained[0] > 0 },
    { target: 'unit1', text: 'Slingers (2) shoot over your front line. Ranged units beat infantry.', done: (me) => me.trained[1] > 0 },
    { target: 'build', text: 'Build a turret: press T, then click a slot on your castle.', done: (me) => me.turrets.some(Boolean) },
    { target: 'ult', text: 'Kills charge your Ultimate (R). When it glows, press R and click to aim it.', wait: 9 },
    { target: 'evolve', text: 'Earn XP, then Evolve (E): a new age, a rebuilt castle, stronger everything.', wait: 9 },
  ];

  function updateTutorial(dt) {
    const tut = state.tut;
    const me = state.sides[0];
    tut.t += dt;
    const s = TUTORIAL[tut.step];
    if ((s.done && s.done(me)) || (s.wait && tut.t >= s.wait)) {
      tut.step++;
      tut.t = 0;
      if (tut.step >= TUTORIAL.length) finishTutorial();
      else Sound.ready();
    }
  }

  function finishTutorial() {
    state.tut = null;
    save.tutorial = true;
    storeSave();
  }

  const ROLE_PLURAL = ['infantry', 'ranged units', 'heavies'];
  const plural = (name) => (name.endsWith('man') ? `${name.slice(0, -3)}men` : `${name}s`);

  function updateHints(dt) {
    if (state.hint) {
      state.hint.t -= dt;
      if (state.hint.t <= 0) state.hint = null;
    }
    if (!save.hints || state.tut || state.sides[0].ai) return;
    state.hintT -= dt;
    if (state.hintT > 0) return;
    const tip = pickHint();
    state.hint = tip ? { text: tip, t: 7 } : null;
    state.hintT = tip ? 40 : 5;
  }

  // The most useful tip right now, in priority order.
  function pickHint() {
    const me = state.sides[0];
    const a = AGES[me.age];
    const count = [0, 0, 0];
    for (const u of state.units) if (u.side === 1) count[u.t]++;
    const most = count.indexOf(Math.max(...count));
    if (canEvolve(me)) return 'You have enough XP to evolve! Press E.';
    if (me.ult >= 1) return `${a.ult} is ready: press R, then click where it should land.`;
    if (count[most] >= 3) {
      const c = BEATS.indexOf(most);
      return `${enemyName()} is massing ${ROLE_PLURAL[most]}. ${plural(a.units[c])} (${c + 1}) deal +35% damage to them.`;
    }
    if (!me.turrets.some(Boolean) && state.t > 50) return 'Turrets (T) guard your castle while your army is away.';
    if (me.gold >= upgradeCost(me) * 2) return 'Spare gold? Upgrade your army (U) for +10% HP and damage.';
    if (!me.queue.length && me.gold > unitCost(me, 2)) return 'Your barracks are idle: you can queue up to 5 units.';
    return null;
  }

  // ---------------------------------------------------------------------------
  // HUD layout: stats on the left, action tiles in the middle, system buttons
  // on the right. Everything is hit-tested in canvas coordinates.
  // ---------------------------------------------------------------------------

  const TILE = { x0: 264, y: 9, w: 58, h: 62, gap: 5 };
  const SYS = { x0: 874, y: 9, size: 36, gap: 4 };
  const INTRO_SKIP = { x: 874, y: 52, w: 116, h: 24 };

  function hudTiles() {
    const me = state.sides[0];
    const a = AGES[me.age];
    const playing = state.mode === 'playing' && !me.ai;
    const tiles = [0, 1, 2].map((t) => {
      const ty = TYPES[t];
      const cost = unitCost(me, t);
      const training = me.queue.length && me.queue[0].t === t ? me.trainT / ty.train : -1;
      return {
        id: `unit${t}`, key: String(t + 1), cost: `${cost}`,
        enabled: playing && me.gold >= cost && me.queue.length < MAX_QUEUE,
        icon: (x, y) => drawUnitIcon(x, y, me.age, t),
        progress: training,
        count: me.queue.filter((q) => q.t === t).length,
        tip: [`${a.units[t]} · ${ty.role}`, `${cost} gold · trains in ${ty.train}s`,
          `HP ${Math.round(ty.hp * a.mult * power(me))} · DMG ${Math.round(ty.dmg * a.mult * power(me))}${ty.range ? ` · range ${ty.range}` : ''}`,
          `Strong vs ${ROLE_PLURAL[BEATS[t]]} · weak vs ${ROLE_PLURAL[BEATS.indexOf(t)]}`,
          ty.range ? 'Shoots over your front line.' : t === 2 ? 'Slow but very tough.' : 'Cheap front line.'],
      };
    });
    tiles.push({
      id: 'build', key: 'T', cost: `${turretCost(me)}`,
      enabled: playing, active: ui.mode === 'build',
      icon: (x, y) => drawTurretIcon(x, y, me.age),
      tip: [`${a.turret}`, `${turretCost(me)} gold`, 'Click, then pick a slot on your castle.',
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
    const cd = SPECIAL.cooldown * (me.persona.specialCd || 1);
    tiles.push({
      id: 'special', key: 'Q', cost: me.specialCd > 0 ? `${Math.ceil(me.specialCd)}s` : 'Ready',
      enabled: playing && me.specialCd <= 0, glow: playing && me.specialCd <= 0,
      cooldown: me.specialCd / cd,
      icon: (x, y) => drawSpecialIcon(x, y, me.age),
      tip: [a.special, 'Rains damage on enemies across the field.', `Recharges in ${cd}s.`],
    });
    const ready = me.ult >= 1;
    tiles.push({
      id: 'ult', key: 'R', cost: ready ? 'READY' : `${Math.floor(me.ult * 100)}%`,
      enabled: playing && ready, glow: playing && ready && ui.mode !== 'ult', active: ui.mode === 'ult',
      charge: me.ult, ult: true,
      icon: (x, y) => drawUltIcon(x, y, me.age, me.ult),
      tip: [`Ultimate: ${a.ult}`, a.ultInfo, 'Charged by kills, and by damage to your castle.',
        'Press R, then click the battlefield to aim.'],
    });
    const next = AGES[me.age + 1];
    tiles.push({
      id: 'evolve', key: 'E', cost: next ? `${a.xpNext} XP` : 'Max',
      enabled: playing && canEvolve(me), glow: playing && canEvolve(me),
      fill: next ? clamp(me.xp / a.xpNext, 0, 1) : 1,
      icon: (x, y) => drawEvolveIcon(x, y, me.age),
      tip: next
        ? [`Evolve to the ${next.name}`, `Needs ${a.xpNext} XP (you have ${Math.floor(me.xp)})`,
          `Units: ${next.units.join(', ')}`, `Turret: ${next.turret} · Special: ${next.special}`,
          `Ultimate: ${next.ult}`, 'Rebuilds and heals your castle.']
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

  // The tutorial's speech box sits under the tile it points at.
  function tutLayout() {
    const s = TUTORIAL[state.tut.step];
    const tile = hudTiles().find((t) => t.id === s.target);
    const w = 330;
    const h = 64;
    const x = clamp(tile.x + tile.w / 2 - w / 2, 8, W - w - 8);
    const y = BAR + 18 + (ui.mode ? 34 : 0); // below the mode banner when one shows
    return { x, y, w, h, tile, text: s.text, skip: { x: x + w - 92, y: y + h - 22, w: 84, h: 18 } };
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

  // Where the ultimate would land if fired now.
  function ultAim() {
    const me = state.sides[0];
    const [lo, hi] = ultRange(me);
    if (ui.mx >= 0 && ui.my > BAR) return clamp(ui.mx, lo, hi);
    const best = bestUltTarget(me);
    return best ? best.x : (lo + hi) / 2;
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
    else if (id === 'ult') {
      if (me.ult < 1) { deny(me); return; }
      // Pressing R again while aiming fires at the reticle.
      if (ui.mode === 'ult') fireUlt();
      else { ui.mode = 'ult'; Sound.click(); }
    } else if (id === 'evolve') evolve(me);
  }

  function fireUlt() {
    if (castUltimate(state.sides[0], ultAim())) ui.mode = null;
  }

  // What is under the pointer: a tile, a system button, a slot or the field.
  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return { kind: 'sys', item: b };
    if (state.mode === 'menu') return null;
    if (state.mode === 'intro') {
      return inside(INTRO_SKIP, x, y) ? { kind: 'skipintro', item: INTRO_SKIP } : { kind: 'intro' };
    }
    if (state.tut && state.mode === 'playing') {
      const L = tutLayout();
      if (inside(L.skip, x, y)) return { kind: 'skiptut', item: L.skip };
    }
    for (const t of hudTiles()) if (inside(t, x, y)) return { kind: 'tile', item: t };
    if (ui.mode === 'build' || ui.mode === 'sell') {
      for (const s of slotSpots()) if (inside(s, x, y)) return { kind: 'slot', item: s };
    }
    if (ui.mode === 'ult' && y > BAR && y < H) return { kind: 'field' };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rendering: canvas size and the cached battlefield
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const fieldCache = new Map();

  function resize() {
    const cssW = canvas.clientWidth || W;
    // Sharp on high-DPI screens, but keep the backing store a sane size.
    const dpr = Math.min(window.devicePixelRatio || 1, 3, 4096 / cssW);
    const w = Math.round(cssW * dpr);
    if (w === canvas.width) return;
    canvas.width = w;
    canvas.height = Math.round(w * (H / W));
    fieldCache.clear(); // backgrounds are re-painted at the new resolution
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();

  // The painted battlefield for a pair of ages: the left half shows the
  // player's era, the right half the enemy's, blended in the middle.
  function field(key) {
    let c = fieldCache.get(key);
    if (c) return c;
    if (fieldCache.size >= 3) fieldCache.delete(fieldCache.keys().next().value);
    const s = canvas.width / W;
    const make = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((W + MARGIN * 2) * s);
      cv.height = Math.ceil((H + MARGIN * 2) * s);
      const g = cv.getContext('2d');
      g.setTransform(s, 0, 0, s, MARGIN * s, MARGIN * s);
      return [cv, g];
    };
    const [l, r] = key.split('-').map(Number);
    let g;
    [c, g] = make();
    paintEra(g, l);
    if (r !== l) {
      const [tmp, t] = make();
      paintEra(t, r);
      t.globalCompositeOperation = 'destination-in';
      const grad = t.createLinearGradient(MID - 150, 0, MID + 150, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      t.fillStyle = grad;
      t.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(tmp, 0, 0);
    }
    fieldCache.set(key, c);
    return c;
  }

  const drawField = (key) => ctx.drawImage(field(key), -MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);

  // --- Era painters (run once per resize; drawn into the cache) ---------------

  const X0 = -MARGIN;
  const X1 = W + MARGIN;
  const VOLCANOES = [{ x: 230, y: 196, w: 200 }, { x: 800, y: 246, w: 150 }];
  const CASTLES_FAR = [{ x: 250, y: 352 }, { x: 765, y: 360 }];
  const WINDMILLS = [{ x: 330, y: 430 }, { x: 690, y: 436 }];
  const CHIMNEYS = [{ x: 150, y: 250 }, { x: 196, y: 270 }, { x: 742, y: 262 }, { x: 812, y: 240 }];
  // Neon towers for the future city: shared by the painter and the live lights.
  const TOWERS = (() => {
    const r = seeded(77);
    const list = [];
    for (let x = X0; x < X1;) {
      const w = 34 + r() * 40;
      list.push({ x, w, h: 90 + r() * 120, neon: r() < 0.5 ? '#22d3ee' : '#e879f9', antenna: r() < 0.45 });
      x += w + 10 + r() * 50;
    }
    return list;
  })();

  function paintEra(g, age) {
    [paintStone, paintIron, paintPowder, paintFuture][age](g, seeded(age * 991 + 13));
  }

  function skyFill(g, stops) {
    const grad = g.createLinearGradient(0, -MARGIN, 0, GROUND);
    stops.forEach((c, k) => grad.addColorStop(k / (stops.length - 1), c));
    g.fillStyle = grad;
    g.fillRect(X0, -MARGIN, X1 - X0, GROUND + MARGIN);
  }

  function ridge(g, y, amp, freq, phase, color, rough = 0, r = Math.random) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(X0, GROUND + 2);
    for (let x = X0; x <= X1 + 10; x += 10) {
      g.lineTo(x, y - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.7 + phase) * amp * 0.3 - r() * rough);
    }
    g.lineTo(X1 + 10, GROUND + 2);
    g.closePath();
    g.fill();
  }

  function glowDisc(g, x, y, r, core, halo, haloR) {
    const grad = g.createRadialGradient(x, y, r * 0.5, x, y, haloR);
    grad.addColorStop(0, halo);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - haloR, y - haloR, haloR * 2, haloR * 2);
    g.fillStyle = core;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function groundBase(g, color, top) {
    g.fillStyle = color;
    g.fillRect(X0, GROUND, X1 - X0, H - GROUND + MARGIN);
    g.fillStyle = top;
    g.fillRect(X0, GROUND, X1 - X0, 6);
    const grad = g.createLinearGradient(0, GROUND, 0, H + MARGIN);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grad;
    g.fillRect(X0, GROUND, X1 - X0, H - GROUND + MARGIN);
  }

  function paintStone(g, r) {
    skyFill(g, ['#d9714a', '#f0a76c', '#f8cf98', '#fde6c1']);
    glowDisc(g, 600, 260, 42, '#fff1d0', 'rgba(255,214,150,0.6)', 170);
    ridge(g, 340, 40, 0.007, 1.2, '#dba97f', 18, r);
    // Volcanoes with glowing lava streaks.
    for (const v of VOLCANOES) {
      const grad = g.createLinearGradient(v.x - v.w, 0, v.x + v.w, 0);
      grad.addColorStop(0, '#7a4a35');
      grad.addColorStop(0.55, '#5c3727');
      grad.addColorStop(1, '#3f261b');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(v.x - v.w, 440);
      g.quadraticCurveTo(v.x - v.w * 0.3, v.y + 70, v.x - 24, v.y);
      g.lineTo(v.x + 24, v.y + 2);
      g.quadraticCurveTo(v.x + v.w * 0.3, v.y + 70, v.x + v.w, 440);
      g.fill();
      g.strokeStyle = 'rgba(249,115,22,0.75)';
      g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const sx = v.x + (k - 1.5) * 12;
        g.lineWidth = 3 - k * 0.4;
        g.beginPath();
        g.moveTo(sx, v.y + 2);
        g.quadraticCurveTo(sx + (k - 1.5) * 18, v.y + 60, sx + (k - 1.5) * 34 + r() * 10, v.y + 90 + r() * 60);
        g.stroke();
      }
      const glow = g.createRadialGradient(v.x, v.y, 4, v.x, v.y, 60);
      glow.addColorStop(0, 'rgba(253,186,116,0.9)');
      glow.addColorStop(1, 'rgba(249,115,22,0)');
      g.fillStyle = glow;
      g.fillRect(v.x - 60, v.y - 60, 120, 120);
    }
    ridge(g, 410, 30, 0.012, 3.1, '#b98559', 6, r);
    // Rocky cliffs with cave mouths.
    for (const [cx, cw, ch] of [[430, 80, 70], [660, 64, 56], [40, 70, 60]]) {
      g.fillStyle = '#8f6646';
      g.beginPath();
      g.moveTo(cx - cw, GROUND);
      g.lineTo(cx - cw * 0.8, GROUND - ch * 0.7);
      g.lineTo(cx - cw * 0.3, GROUND - ch);
      g.lineTo(cx + cw * 0.4, GROUND - ch * 0.9);
      g.lineTo(cx + cw, GROUND);
      g.fill();
      g.fillStyle = '#6e4b33';
      g.beginPath();
      g.moveTo(cx + cw * 0.1, GROUND - ch * 0.95);
      g.lineTo(cx + cw * 0.4, GROUND - ch * 0.9);
      g.lineTo(cx + cw, GROUND);
      g.lineTo(cx + cw * 0.2, GROUND);
      g.fill();
      g.fillStyle = '#2a1a12';
      g.beginPath();
      g.ellipse(cx, GROUND, cw * 0.28, ch * 0.45, 0, Math.PI, 0);
      g.fill();
    }
    // Prehistoric palms and ferns.
    for (const [px, ph] of [[120, 90], [330, 70], [540, 100], [720, 80], [900, 95], [980, 70]]) {
      g.strokeStyle = '#5b3d24';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(px, GROUND);
      g.quadraticCurveTo(px + 10, GROUND - ph * 0.6, px + 4, GROUND - ph);
      g.stroke();
      g.fillStyle = '#4d6b2a';
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.55;
        g.beginPath();
        g.ellipse(px + 4 + Math.cos(a) * 18, GROUND - ph + Math.sin(a) * 8 + 6, 22, 5, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    groundBase(g, '#7d5f3f', '#94714b');
    for (let k = 0; k < 70; k++) {
      g.fillStyle = r() < 0.5 ? '#6b4f33' : '#a08060';
      g.beginPath();
      g.ellipse(X0 + r() * (X1 - X0), GROUND + 8 + r() * 64, 2 + r() * 4, 1 + r() * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // A few old bones.
    g.strokeStyle = '#efe6d8';
    g.lineWidth = 3;
    for (const bx of [260, 590, 840]) {
      g.beginPath();
      g.moveTo(bx - 8, GROUND + 40);
      g.lineTo(bx + 8, GROUND + 36);
      g.stroke();
    }
  }

  function paintIron(g, r) {
    skyFill(g, ['#3f7fd0', '#6ea8e8', '#a9cff2', '#eaf3fb']);
    glowDisc(g, 720, 150, 30, '#fffbea', 'rgba(255,255,255,0.7)', 120);
    // Soft clouds.
    for (let k = 0; k < 9; k++) {
      const cx = X0 + r() * (X1 - X0);
      const cy = 110 + r() * 130;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let j = 0; j < 5; j++) {
        g.beginPath();
        g.ellipse(cx + (j - 2) * 18 + r() * 8, cy + r() * 6, 22 + r() * 12, 10 + r() * 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    ridge(g, 365, 30, 0.006, 0.4, '#a7c3ad', 0, r);
    // Distant castles on the hills.
    for (const c of CASTLES_FAR) {
      g.fillStyle = '#8796ab';
      g.fillRect(c.x - 40, c.y - 30, 80, 40);
      for (const tx of [-44, 32]) {
        g.fillRect(c.x + tx, c.y - 58, 14, 68);
        g.beginPath();
        g.moveTo(c.x + tx - 3, c.y - 58);
        g.lineTo(c.x + tx + 7, c.y - 78);
        g.lineTo(c.x + tx + 17, c.y - 58);
        g.fill();
      }
      g.fillRect(c.x - 10, c.y - 52, 20, 30);
      for (let k = 0; k < 6; k++) g.fillRect(c.x - 40 + k * 14, c.y - 36, 8, 6);
    }
    ridge(g, 418, 26, 0.011, 2.2, '#82b06c', 0, r);
    // Pines.
    for (let k = 0; k < 26; k++) {
      const px = X0 + r() * (X1 - X0);
      const py = 430 + r() * 30;
      const s = 0.7 + r() * 0.6;
      g.fillStyle = r() < 0.5 ? '#2f5d3a' : '#3b6e44';
      g.beginPath();
      g.moveTo(px, py - 42 * s);
      g.lineTo(px - 12 * s, py);
      g.lineTo(px + 12 * s, py);
      g.fill();
    }
    // Windmill towers (the sails turn in the live layer).
    for (const m of WINDMILLS) {
      g.fillStyle = '#e2d3b4';
      g.beginPath();
      g.moveTo(m.x - 14, m.y + 40);
      g.lineTo(m.x - 9, m.y);
      g.lineTo(m.x + 9, m.y);
      g.lineTo(m.x + 14, m.y + 40);
      g.fill();
      g.fillStyle = '#9a3412';
      g.beginPath();
      g.moveTo(m.x - 12, m.y + 1);
      g.lineTo(m.x, m.y - 12);
      g.lineTo(m.x + 12, m.y + 1);
      g.fill();
      g.fillStyle = '#57534e';
      g.fillRect(m.x - 3, m.y + 28, 6, 12);
    }
    ridge(g, 466, 10, 0.03, 0.8, '#6a9a50', 0, r);
    groundBase(g, '#58773f', '#6d9a48');
    g.fillStyle = 'rgba(214,190,140,0.28)';
    g.fillRect(X0, GROUND + 16, X1 - X0, 18);
    for (let k = 0; k < 90; k++) {
      const fx2 = X0 + r() * (X1 - X0);
      const fy = GROUND + 6 + r() * 66;
      g.fillStyle = ['#fef08a', '#fda4af', '#ffffff', '#3f6b2a'][(r() * 4) | 0];
      g.fillRect(fx2, fy, 2, 2);
    }
  }

  function paintPowder(g, r) {
    skyFill(g, ['#3b3633', '#6b6058', '#a39080', '#dfb98a']);
    g.globalAlpha = 0.75;
    glowDisc(g, 520, 236, 36, '#f6c27f', 'rgba(246,170,90,0.45)', 140);
    g.globalAlpha = 1;
    // Far industrial skyline.
    g.fillStyle = '#7f7065';
    for (let x = X0; x < X1;) {
      const w = 30 + r() * 50;
      const h = 30 + r() * 60;
      g.fillRect(x, 420 - h, w, h + 30);
      if (r() < 0.5) g.fillRect(x + w * 0.3, 420 - h - 40 - r() * 30, 6, 60);
      x += w + r() * 10;
    }
    ridge(g, 440, 8, 0.02, 1.5, '#6e625a', 0, r);
    // Factories with sawtooth roofs, glowing windows and tall chimneys.
    for (const [fx0, fw] of [[90, 200], [700, 200]]) {
      const top = 360;
      g.fillStyle = '#7a3b2a';
      g.fillRect(fx0, top, fw, GROUND - top);
      g.fillStyle = '#4b3a33';
      g.beginPath();
      g.moveTo(fx0, top);
      for (let k = 0; k < 5; k++) {
        const sx = fx0 + (k * fw) / 5;
        g.lineTo(sx, top - 24);
        g.lineTo(sx + fw / 5, top);
      }
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = top + 8; y < GROUND; y += 8) g.fillRect(fx0, y, fw, 1);
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 7; k++) {
          g.fillStyle = r() < 0.75 ? '#fbbf24' : '#3f2a22';
          g.fillRect(fx0 + 12 + k * 27, top + 20 + row * 32, 14, 18);
        }
      }
    }
    for (const c of CHIMNEYS) {
      g.fillStyle = '#5b2b20';
      g.fillRect(c.x - 8, c.y, 16, 360 - c.y + 2);
      g.fillStyle = '#3f1d15';
      g.fillRect(c.x - 10, c.y - 4, 20, 6);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(c.x - 8, c.y + 20, 16, 3);
    }
    // Telegraph poles and sagging wires.
    g.strokeStyle = '#2f2a27';
    g.lineWidth = 1;
    const poles = [];
    for (let x = 20; x < X1; x += 160) poles.push(x);
    for (const px of poles) {
      g.fillStyle = '#3b302a';
      g.fillRect(px - 2, 400, 4, 88);
      g.fillRect(px - 10, 404, 20, 3);
    }
    for (let k = 0; k < poles.length - 1; k++) {
      for (const dy of [404, 410]) {
        g.beginPath();
        g.moveTo(poles[k], dy);
        g.quadraticCurveTo((poles[k] + poles[k + 1]) / 2, dy + 16, poles[k + 1], dy);
        g.stroke();
      }
    }
    groundBase(g, '#4a423c', '#5d534b');
    // Railway.
    g.fillStyle = '#2f2723';
    for (let x = X0; x < X1; x += 16) g.fillRect(x, GROUND + 22, 9, 10);
    g.fillStyle = '#9ca3af';
    g.fillRect(X0, GROUND + 23, X1 - X0, 2);
    g.fillRect(X0, GROUND + 29, X1 - X0, 2);
    for (let k = 0; k < 60; k++) {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(X0 + r() * (X1 - X0), GROUND + 40 + r() * 30, 6 + r() * 6, 3);
    }
  }

  function paintFuture(g, r) {
    skyFill(g, ['#03031a', '#0d0a35', '#2b1270', '#6d28d9']);
    for (let k = 0; k < 140; k++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      const s = r() < 0.1 ? 2 : 1;
      g.fillRect(X0 + r() * (X1 - X0), -MARGIN + r() * 360, s, s);
    }
    // A ringed planet.
    const pg = g.createRadialGradient(740, 130, 10, 760, 150, 60);
    pg.addColorStop(0, '#f5d0fe');
    pg.addColorStop(1, '#7c3aed');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(760, 150, 54, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(244,208,254,0.7)';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(760, 150, 96, 18, -0.25, 0, Math.PI * 2);
    g.stroke();
    // Far skyline with lit windows.
    for (let x = X0; x < X1;) {
      const w = 22 + r() * 36;
      const h = 70 + r() * 150;
      g.fillStyle = '#1a1745';
      g.fillRect(x, 440 - h, w, h + 50);
      for (let y = 440 - h + 6; y < 440; y += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 7) {
          if (r() < 0.35) {
            g.fillStyle = ['#67e8f9', '#f0abfc', '#fde68a'][(r() * 3) | 0];
            g.globalAlpha = 0.5 + r() * 0.4;
            g.fillRect(wx, y, 3, 4);
            g.globalAlpha = 1;
          }
        }
      }
      x += w + 4 + r() * 12;
    }
    // Hover rail.
    g.strokeStyle = 'rgba(103,232,249,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X0, 395);
    g.lineTo(X1, 380);
    g.stroke();
    // Neon towers.
    for (const t of TOWERS) {
      const top = 470 - t.h;
      g.fillStyle = '#100d2c';
      g.fillRect(t.x, top, t.w, t.h + 20);
      g.strokeStyle = t.neon;
      g.lineWidth = 1.5;
      g.shadowColor = t.neon;
      g.shadowBlur = 8;
      g.strokeRect(t.x + 0.75, top + 0.75, t.w - 1.5, t.h + 20);
      g.fillStyle = t.neon;
      for (let y = top + 10; y < 470; y += 22) g.fillRect(t.x + 4, y, t.w - 8, 1.5);
      g.shadowBlur = 0;
      if (t.antenna) {
        g.fillStyle = '#334155';
        g.fillRect(t.x + t.w / 2 - 1, top - 24, 2, 24);
      }
    }
    groundBase(g, '#11131f', '#1e2340');
    // Glowing perspective grid on the ground.
    g.strokeStyle = 'rgba(34,211,238,0.22)';
    g.lineWidth = 1;
    for (const y of [GROUND + 8, GROUND + 20, GROUND + 38, GROUND + 62]) {
      g.beginPath();
      g.moveTo(X0, y);
      g.lineTo(X1, y);
      g.stroke();
    }
    for (let x = -400; x <= W + 400; x += 60) {
      g.beginPath();
      g.moveTo(MID + (x - MID) * 0.55, GROUND);
      g.lineTo(x, H + MARGIN);
      g.stroke();
    }
    g.fillStyle = 'rgba(34,211,238,0.6)';
    g.fillRect(X0, GROUND, X1 - X0, 1.5);
  }

  // --- Live ambience: smoke, sails, birds, flying cars --------------------------

  function drawAmbient(age, x0, x1, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, -MARGIN, x1 - x0, H + MARGIN * 2);
    ctx.clip();
    const reduced = save.effects === 'reduced';
    if (age === 0) {
      for (const v of VOLCANOES) {
        const pulse = 0.25 + 0.15 * Math.sin(t * 2 + v.x);
        ctx.fillStyle = `rgba(253,186,116,${pulse})`;
        ctx.beginPath();
        ctx.ellipse(v.x, v.y, 26, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        const n = reduced ? 4 : 8;
        for (let k = 0; k < n; k++) {
          const ph = (t * 0.09 + k / n) % 1;
          ctx.fillStyle = `rgba(68,52,46,${0.5 * (1 - ph)})`;
          ctx.beginPath();
          ctx.arc(v.x + Math.sin(ph * 4 + k) * 10 + ph * 70, v.y - 6 - ph * 180, 10 + ph * 42, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // A pterodactyl gliding past.
      const px = ((t * 45) % 1500) - 250;
      const py = 150 + Math.sin(t * 0.7) * 20;
      const flap = Math.sin(t * 6) * 8;
      ctx.strokeStyle = '#3b2a20';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(px - 22, py - flap);
      ctx.lineTo(px - 6, py);
      ctx.lineTo(px + 4, py - 2);
      ctx.lineTo(px + 22, py - flap);
      ctx.moveTo(px + 4, py - 2);
      ctx.lineTo(px + 14, py + 2);
      ctx.stroke();
    } else if (age === 1) {
      for (const m of WINDMILLS) {
        ctx.save();
        ctx.translate(m.x, m.y + 6);
        ctx.rotate(t * 0.9 + m.x);
        ctx.fillStyle = '#f5f0e6';
        ctx.strokeStyle = '#78716c';
        ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.fillRect(2, -3, 28, 6);
          ctx.strokeRect(2, -3, 28, 6);
        }
        ctx.restore();
      }
      // Banners on the distant castles.
      CASTLES_FAR.forEach((c, k) => {
        for (const tx of [-37, 39]) {
          const bx = c.x + tx;
          const by = c.y - 80;
          ctx.fillStyle = '#57534e';
          ctx.fillRect(bx, by, 1.5, 16);
          ctx.fillStyle = k ? '#dc2626' : '#2563eb';
          ctx.beginPath();
          ctx.moveTo(bx + 1, by);
          ctx.quadraticCurveTo(bx + 8, by + 2 + Math.sin(t * 5 + tx) * 2, bx + 14, by + 3 + Math.sin(t * 5 + tx + 1) * 2);
          ctx.lineTo(bx + 1, by + 8);
          ctx.fill();
        }
      });
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const bx = ((t * 30 + k * 37) % 1300) - 150;
        const by = 170 + k * 9 + Math.sin(t + k) * 6;
        const f = Math.sin(t * 8 + k) * 3;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by - f);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + 6, by - f);
        ctx.stroke();
      }
    } else if (age === 2) {
      CHIMNEYS.forEach((c, j) => {
        const n = reduced ? 4 : 9;
        for (let k = 0; k < n; k++) {
          const ph = (t * 0.12 + k / n + j * 0.13) % 1;
          ctx.fillStyle = `rgba(40,36,34,${0.55 * (1 - ph)})`;
          ctx.beginPath();
          ctx.arc(c.x + ph * 110 + Math.sin(ph * 5 + j) * 8, c.y - 4 - ph * 150, 7 + ph * 34, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      // A zeppelin drifting by.
      const zx = ((t * 14) % 1500) - 250;
      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.ellipse(zx, 150, 56, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(zx - 14, 164, 28, 7);
      ctx.beginPath();
      ctx.moveTo(zx - 50, 150);
      ctx.lineTo(zx - 66, 138);
      ctx.lineTo(zx - 66, 162);
      ctx.fill();
    } else {
      // Blinking antenna lights.
      TOWERS.forEach((tw, k) => {
        if (!tw.antenna || Math.sin(t * 3 + k * 1.7) < 0.3) return;
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(tw.x + tw.w / 2, 470 - tw.h - 25, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // Searchlights.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [sx, ph] of [[300, 0], [690, 2]]) {
        const a = -Math.PI / 2 + Math.sin(t * 0.5 + ph) * 0.5;
        ctx.fillStyle = 'rgba(165,243,252,0.06)';
        ctx.beginPath();
        ctx.moveTo(sx, 470);
        ctx.lineTo(sx + Math.cos(a - 0.06) * 520, 470 + Math.sin(a - 0.06) * 520);
        ctx.lineTo(sx + Math.cos(a + 0.06) * 520, 470 + Math.sin(a + 0.06) * 520);
        ctx.fill();
      }
      // Flying cars on sky lanes.
      for (let k = 0; k < (reduced ? 4 : 8); k++) {
        const dir = k % 2 ? 1 : -1;
        const sp = 90 + (k * 37) % 70;
        let cx = ((t * sp + k * 211) % 1400) - 200;
        if (dir < 0) cx = W - cx;
        const cy = 190 + k * 22;
        const col = k % 3 === 0 ? '#f0abfc' : '#67e8f9';
        const grad = ctx.createLinearGradient(cx - dir * 50, 0, cx, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, col);
        ctx.fillStyle = grad;
        ctx.fillRect(Math.min(cx, cx - dir * 50), cy, 50, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 3, cy - 1, 6, 4);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // --- Castles -------------------------------------------------------------------

  function drawBase(side) {
    const x = side.i === 0 ? 20 : W - 20 - BASE_W;
    const flash = side.hitFlash > 0;
    const e = state.ending;
    const sink = e && e.loser === side.i ? ease((e.t - 0.4) / 2.6) * (BASE_H + 60) : 0;
    ctx.save();
    if (sink) {
      ctx.beginPath();
      ctx.rect(x - 80, -MARGIN, BASE_W + 160, GROUND + MARGIN);
      ctx.clip();
      ctx.translate(rand(-2, 2), sink);
      ctx.rotate(side.dir * sink * 0.0015);
    }
    if (side.rebuild < 1) {
      // The new castle rises from the ground, replacing the old one.
      const p = ease(side.rebuild);
      const cut = GROUND - (BASE_H + 100) * p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 40, -MARGIN, BASE_W + 80, cut + MARGIN);
      ctx.clip();
      drawCastle(side, side.prevAge, x, flash);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 40, cut, BASE_W + 80, GROUND - cut + 2);
      ctx.clip();
      drawCastle(side, side.age, x, flash);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = AGES[side.age].glow;
      const grad = ctx.createLinearGradient(0, cut - 12, 0, cut + 12);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, glow);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 16, cut - 12, BASE_W + 32, 24);
      ctx.restore();
      // Scaffolding poles.
      ctx.strokeStyle = 'rgba(120,53,15,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const sx of [x - 6, x + BASE_W + 6]) {
        ctx.moveTo(sx, GROUND);
        ctx.lineTo(sx, cut - 8);
      }
      ctx.moveTo(x - 6, cut);
      ctx.lineTo(x + BASE_W + 6, cut);
      ctx.stroke();
    } else {
      drawCastle(side, side.age, x, flash);
    }

    // Cracks spread as the castle loses health.
    const dmg = 1 - side.hp / side.maxHp;
    const n = Math.floor(dmg * 8);
    if (n > 0) {
      ctx.strokeStyle = 'rgba(20,10,5,0.7)';
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      for (let k = 0; k < Math.min(n, side.cracks.length); k++) {
        const pts = side.cracks[k];
        ctx.beginPath();
        pts.forEach(([px, py], j) => {
          const yy = GROUND - BASE_H + py;
          if (j) ctx.lineTo(x + px, yy);
          else ctx.moveTo(x + px, yy);
        });
        ctx.stroke();
      }
    }

    side.turrets.forEach((tur, slot) => {
      if (tur) drawTurret(turretPos(side, slot), tur.age, tur.aim, tur.kick, tur.pop);
    });
    ctx.restore();
    if (sink || state.mode === 'menu') return;

    // Health bar and label.
    const c = SIDE_COLORS[side.i];
    const bw = BASE_W + 16;
    const bx = x - 8;
    const by = GROUND - BASE_H - 92;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(bx, by, bw, 9, 4);
    ctx.fill();
    const f = clamp(side.hp / side.maxHp, 0, 1);
    ctx.fillStyle = f < 0.25 ? '#ef4444' : c.body;
    roundRect(bx + 1, by + 1, Math.max(4, (bw - 2) * f), 7, 3);
    ctx.fill();
    ctx.textAlign = 'center';
    outlined(`${Math.ceil(side.hp)} / ${side.maxHp}`, bx + bw / 2, by - 4, 'bold 11px system-ui, sans-serif', '#fff');
    const label = side.i === 0 ? 'You' : state.general ? state.general.name : 'Enemy';
    const text = `${label} · ${AGES[side.age].name}`;
    ctx.font = '600 10px system-ui, sans-serif';
    const half = ctx.measureText(text).width / 2 + 4;
    outlined(text, clamp(bx + bw / 2, half, W - half), by + 21, '600 10px system-ui, sans-serif', '#fff');
  }

  // Hits tint the castle white for a moment rather than blanking it out.
  function drawCastle(side, age, x, flash) {
    paintCastle(side, age, x, false);
    if (!flash) return;
    ctx.save();
    ctx.globalAlpha = 0.45;
    paintCastle(side, age, x, true);
    ctx.restore();
  }

  function paintCastle(side, age, x, flash) {
    const c = SIDE_COLORS[side.i];
    const top = GROUND - BASE_H;
    const cx = x + BASE_W / 2;
    const t = performance.now() / 1000;
    const base = ctx.globalAlpha;
    const w = (col) => (flash ? '#fff' : col);
    if (age === 0) {
      // A pile of boulders with a cave, a fire and a hide banner.
      ctx.fillStyle = w('#8b7355');
      ctx.beginPath();
      ctx.ellipse(cx, GROUND, BASE_W / 2 + 8, 74, 0, Math.PI, 0);
      ctx.fill();
      for (const [ex, ey, rx, ry] of [[20, 66, 24, 28], [60, 70, 24, 30], [40, 96, 24, 20]]) {
        ctx.beginPath();
        ctx.ellipse(x + ex, GROUND - ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = w('#6b5a48');
      ctx.beginPath();
      ctx.ellipse(x + 62, GROUND - 24, 26, 46, 0, Math.PI * 1.5, Math.PI * 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 66, GROUND - 74, 14, 24, 0, Math.PI * 1.5, Math.PI * 0.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(x + 26, GROUND - 80, 12, 7, -0.4, 0, Math.PI * 2);
      ctx.ellipse(x + 34, GROUND - 106, 9, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(cx, GROUND, 17, 30, 0, Math.PI, 0);
      ctx.fill();
      const flick = 0.6 + 0.4 * Math.sin(t * 13 + side.i * 3);
      ctx.fillStyle = `rgba(249,115,22,${0.5 * flick})`;
      ctx.beginPath();
      ctx.ellipse(cx, GROUND - 6, 10, 12 * flick, 0, Math.PI, 0);
      ctx.fill();
      // Wooden palisade spikes.
      ctx.fillStyle = w('#7c4a1f');
      for (let k = 0; k < 4; k++) {
        const px = x + 6 + k * 21;
        ctx.beginPath();
        ctx.moveTo(px, GROUND);
        ctx.lineTo(px, GROUND - 16);
        ctx.lineTo(px + 3, GROUND - 22);
        ctx.lineTo(px + 6, GROUND - 16);
        ctx.lineTo(px + 6, GROUND);
        ctx.fill();
      }
      drawFlag(cx, top - 4, 46, c.body, side.dir, t, 'hide');
    } else if (age === 1) {
      // Stone keep with corner towers and banners.
      ctx.fillStyle = w('#9ca3af');
      ctx.fillRect(x + 8, top + 6, BASE_W - 16, BASE_H - 6);
      ctx.fillStyle = w('#8b929c');
      ctx.fillRect(x - 4, top - 14, 22, BASE_H + 14);
      ctx.fillRect(x + BASE_W - 18, top - 14, 22, BASE_H + 14);
      for (const tx of [x - 4, x + BASE_W - 18]) {
        for (let k = 0; k < 3; k++) ctx.fillRect(tx + k * 8, top - 22, 6, 8);
        ctx.fillStyle = w(c.body);
        ctx.beginPath();
        ctx.moveTo(tx - 3, top - 22);
        ctx.lineTo(tx + 11, top - 48);
        ctx.lineTo(tx + 25, top - 22);
        ctx.fill();
        ctx.fillStyle = w('#8b929c');
      }
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 20 + k * 11, top - 4, 7, 10);
      // Brick lines.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = top + 14; y < GROUND; y += 12) ctx.fillRect(x - 4, y, BASE_W + 8, 1);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x + 4, top + 16, 3, 10);
      ctx.fillRect(x + BASE_W - 7, top + 16, 3, 10);
      ctx.beginPath();
      ctx.moveTo(cx - 14, GROUND);
      ctx.lineTo(cx - 14, GROUND - 30);
      ctx.arc(cx, GROUND - 30, 14, Math.PI, 0);
      ctx.lineTo(cx + 14, GROUND);
      ctx.fill();
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = -10; k <= 10; k += 5) {
        ctx.moveTo(cx + k, GROUND - 40);
        ctx.lineTo(cx + k, GROUND);
      }
      ctx.stroke();
      // Hanging banner.
      ctx.fillStyle = w(c.body);
      ctx.beginPath();
      ctx.moveTo(cx - 9, top + 14);
      ctx.lineTo(cx + 9, top + 14);
      ctx.lineTo(cx + 9, top + 44);
      ctx.lineTo(cx, top + 38);
      ctx.lineTo(cx - 9, top + 44);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.fillRect(cx - 2, top + 20, 4, 10);
      drawFlag(cx, top - 4, 40, c.body, side.dir, t);
    } else if (age === 2) {
      // Brick fort with an iron roof, a chimney and sandbags.
      ctx.fillStyle = w('#8b5a44');
      ctx.fillRect(x, top + 12, BASE_W, BASE_H - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = top + 18, row = 0; y < GROUND; y += 7, row++) {
        ctx.fillRect(x, y, BASE_W, 1);
        for (let bx = x + (row % 2) * 6; bx < x + BASE_W; bx += 12) ctx.fillRect(bx, y - 6, 1, 6);
      }
      ctx.fillStyle = w('#374151');
      ctx.beginPath();
      ctx.moveTo(x - 8, top + 14);
      ctx.lineTo(cx, top - 16);
      ctx.lineTo(x + BASE_W + 8, top + 14);
      ctx.fill();
      ctx.fillStyle = w('#4b5563');
      ctx.fillRect(x + (side.i === 0 ? 14 : BASE_W - 26), top - 26, 12, 30);
      ctx.fillStyle = '#1c1917';
      for (const py of [top + 34, top + 64]) {
        ctx.beginPath();
        ctx.arc(x + (side.i === 0 ? BASE_W - 12 : 12), py, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(cx - 14, GROUND - 40, 28, 40);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + 10, top + 30, 10, 12);
      ctx.fillRect(x + BASE_W - 20, top + 30, 10, 12);
      ctx.fillStyle = w('#a8a29e');
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(x + 4 + k * 18, GROUND - 5, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      drawFlag(cx, top - 16, 40, c.body, side.dir, t);
    } else {
      // Future tower with glowing bands and a shield shimmer.
      const grad = ctx.createLinearGradient(x, 0, x + BASE_W, 0);
      grad.addColorStop(0, flash ? '#fff' : '#cbd5e1');
      grad.addColorStop(1, flash ? '#fff' : '#64748b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x + 4, GROUND);
      ctx.lineTo(x + 18, top - 14);
      ctx.lineTo(x + BASE_W - 18, top - 14);
      ctx.lineTo(x + BASE_W - 4, GROUND);
      ctx.fill();
      ctx.fillStyle = w('#1e293b');
      ctx.fillRect(x + 22, top - 4, BASE_W - 44, BASE_H - 30);
      const pulse = 0.6 + 0.4 * Math.sin(t * 3 + side.i);
      ctx.fillStyle = AGES[3].glow;
      ctx.globalAlpha = base * pulse;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 25, top + 6 + k * 20, BASE_W - 50, 4);
      ctx.globalAlpha = base;
      ctx.fillStyle = c.light;
      ctx.fillRect(x + 8, GROUND - 60, 4, 50);
      ctx.fillRect(x + BASE_W - 12, GROUND - 60, 4, 50);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 1, top - 50, 2, 36);
      ctx.fillStyle = Math.sin(t * 4) > 0 ? '#f43f5e' : '#7f1d1d';
      ctx.beginPath();
      ctx.arc(cx, top - 52, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.light;
      ctx.globalAlpha = base * (0.18 + 0.08 * Math.sin(t * 2));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, GROUND, BASE_W * 0.8, BASE_H + 20, 0, Math.PI, 0);
      ctx.stroke();
      ctx.globalAlpha = base;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 12, GROUND - 32, 24, 32);
      ctx.fillStyle = AGES[3].glow;
      ctx.fillRect(cx - 12, GROUND - 33, 24, 2);
    }
  }

  // A flag in the side's colour, rippling in the wind.
  function drawFlag(x, y, pole, color, dir, t, kind) {
    ctx.fillStyle = '#44403c';
    ctx.fillRect(x - 1, y - pole, 2, pole);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - pole);
    if (kind === 'hide') {
      ctx.lineTo(x + dir * 18, y - pole + 2 + Math.sin(t * 3) * 1.5);
      ctx.lineTo(x + dir * 16, y - pole + 16);
      ctx.lineTo(x + 1, y - pole + 14);
    } else {
      for (let k = 1; k <= 6; k++) {
        ctx.lineTo(x + 1 + dir * k * 4, y - pole + Math.sin(t * 6 - k * 0.8) * 2 * (k / 6));
      }
      for (let k = 6; k >= 0; k--) {
        ctx.lineTo(x + 1 + dir * k * 4, y - pole + 15 + Math.sin(t * 6 - k * 0.8) * 2 * (k / 6));
      }
    }
    ctx.fill();
  }

  function drawTurret(p, age, aim, kick = 0, pop = 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (pop > 0) ctx.scale(1 + pop, 1 + pop);
    ctx.fillStyle = age === 3 ? '#334155' : '#292524';
    roundRect(-12, -1, 24, 11, 3);
    ctx.fill();
    ctx.rotate(aim);
    ctx.translate(-kick * 4, 0);
    if (age === 0) {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(0, -2.5, 20, 5);
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.arc(19, -3, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
    } else if (age === 1) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-4, -2.5, 24, 5);
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(14, -12);
      ctx.quadraticCurveTo(22, 0, 14, 12);
      ctx.stroke();
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, -12);
      ctx.lineTo(4 - kick * 3, 0);
      ctx.lineTo(14, 12);
      ctx.stroke();
      ctx.fillStyle = '#44403c';
    } else if (age === 2) {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(22, -4);
      ctx.lineTo(22, 4);
      ctx.lineTo(-4, 6);
      ctx.fill();
      ctx.fillRect(20, -5.5, 4, 11);
      ctx.fillStyle = '#78350f';
    } else {
      ctx.fillStyle = '#cbd5e1';
      roundRect(-6, -6, 16, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(8, -2.5, 16, 5);
      ctx.fillStyle = AGES[3].glow;
      ctx.fillRect(22, -2.5, 3, 5);
    }
    ctx.beginPath();
    ctx.arc(0, 0, age === 3 ? 4 : 6, 0, Math.PI * 2);
    ctx.fill();
    if (age === 3) {
      ctx.fillStyle = AGES[3].glow;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Units ---------------------------------------------------------------------

  function drawUnit(u) {
    const c = SIDE_COLORS[u.side];
    const a = AGES[u.age];
    const white = u.flash > 0;
    const bob = u.moving ? Math.abs(Math.sin(u.walk)) * 2 : 0;
    const swing = u.atk > 0 ? Math.sin((u.atk / 0.25) * Math.PI) : 0;

    ctx.save();
    ctx.translate(u.x, GROUND);
    if (u.enter > 0) ctx.globalAlpha = 1 - u.enter / 0.25;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, u.w / 2 + 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(u.dir, 1);
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

  // A tumbling body, thrown back by the killing blow.
  function drawCorpse(k) {
    const pivot = k.h / 2 - (k.h / 2 - 5) * Math.abs(Math.sin(k.rot));
    ctx.save();
    ctx.globalAlpha = clamp(k.life / 0.8, 0, 1) * 0.9;
    ctx.translate(k.x, GROUND - k.y - pivot);
    ctx.rotate(k.rot);
    ctx.translate(0, pivot);
    ctx.scale(k.dir, 1);
    const fake = { ...k, moving: false, walk: 0, atk: 0, flash: 0 };
    if (k.t === 2) drawHeavy(fake, SIDE_COLORS[k.side], AGES[k.age], false, 0, 0);
    else drawFoot(fake, SIDE_COLORS[k.side], AGES[k.age], false, 0, 0);
    ctx.restore();
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
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-u.w / 2 + 2, -h * 0.47 - bob, u.w - 4, 3);
    if (u.age === 0) {
      // Fur tunic.
      ctx.fillStyle = white ? '#fff' : '#a16207';
      ctx.fillRect(-u.w / 2 + 2, -h * 0.8 - bob, 4, h * 0.45);
    }

    ctx.fillStyle = white ? '#fff' : '#f5d0a9';
    ctx.beginPath();
    ctx.arc(0, -h * 0.88 - bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(2, -h * 0.9 - bob, 1.5, 1.5);

    if (u.age === 1) {
      ctx.fillStyle = white ? '#fff' : a.metal;
      ctx.beginPath();
      ctx.arc(0, -h * 0.9 - bob, 5.5, Math.PI, 0);
      ctx.fill();
    } else if (u.age === 2) {
      ctx.fillStyle = white ? '#fff' : '#1f2937';
      ctx.fillRect(-6, -h * 0.88 - bob - 6, 12, 3);
      ctx.fillRect(-4, -h * 0.88 - bob - 10, 8, 5);
    } else if (u.age === 3) {
      ctx.fillStyle = white ? '#fff' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, -h * 0.88 - bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = a.glow;
      ctx.fillRect(0, -h * 0.9 - bob, 6, 2.5);
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
      if (u.age === 2) {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.lineTo(0, -6);
        ctx.stroke();
      }
    } else if (u.age === 1) {
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(4 - swing * 2, 0, 9, -1.2, 1.2);
      ctx.stroke();
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(4 - swing * 2 + Math.cos(-1.2) * 9, Math.sin(-1.2) * 9);
      ctx.lineTo(1 - swing * 4, 0);
      ctx.lineTo(4 - swing * 2 + Math.cos(1.2) * 9, Math.sin(1.2) * 9);
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
      if (u.age === 2) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-4, -1, 6, 4);
      }
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
      } else {
        // Caparison in the side's colour.
        ctx.fillStyle = body;
        ctx.fillRect(-w / 2 + 2, -22 - bob, w - 6, 8);
      }
      ctx.fillStyle = body;
      ctx.fillRect(-5, -h + 4 - bob, 10, 14);
      ctx.fillStyle = white ? '#fff' : '#f5d0a9';
      ctx.beginPath();
      ctx.arc(0, -h - bob, 5, 0, Math.PI * 2);
      ctx.fill();
      if (u.age === 1) {
        ctx.fillStyle = white ? '#fff' : a.metal;
        ctx.fillRect(-5.5, -h - bob - 6, 11, 8);
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(0, -h - bob - 2, 5, 1.5);
      }
      ctx.save();
      ctx.translate(3, -h + 10 - bob);
      ctx.rotate(u.age === 1 ? -0.1 + swing * 0.3 : -0.9 + swing * 1.6);
      ctx.strokeStyle = u.age === 1 ? a.metal : '#78350f';
      ctx.lineWidth = u.age === 1 ? 3 : 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(u.age === 1 ? 26 + swing * 6 : 0, u.age === 1 ? 0 : -16);
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
      ctx.fillRect(-4 - swing * 4, -5, 26, 10);
      ctx.restore();
      ctx.fillStyle = white ? '#fff' : '#78350f';
      [-9, 9].forEach((wx) => {
        ctx.beginPath();
        ctx.arc(wx, -7, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const r = u.walk || 0;
        ctx.moveTo(wx + Math.cos(r) * 6, -7 + Math.sin(r) * 6);
        ctx.lineTo(wx - Math.cos(r) * 6, -7 - Math.sin(r) * 6);
        ctx.stroke();
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
      roundRect(-w / 2, -h - bob, w, 24, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-w / 2, -h - bob + 18, w, 6);
      ctx.fillStyle = a.glow;
      ctx.fillRect(w / 2 - 10, -h + 6 - bob, 7, 4);
      ctx.fillStyle = white ? '#fff' : a.metal;
      ctx.fillRect(w / 2 - 4, -h + 14 - bob, 14 - swing * 4, 5);
    }
  }

  // --- Projectiles and strikes ---------------------------------------------------

  const TRAIL_COLORS = ['168,162,158', '255,255,255', '253,230,138', '34,211,238'];

  function drawTrail(trail, x, y, rgb, width) {
    const n = trail.length / 2;
    if (!n) return;
    ctx.lineCap = 'round';
    let px = trail[0];
    let py = trail[1];
    for (let k = 1; k <= n; k++) {
      const nx = k < n ? trail[k * 2] : x;
      const ny = k < n ? trail[k * 2 + 1] : y;
      ctx.strokeStyle = `rgba(${rgb},${(k / n) * 0.6})`;
      ctx.lineWidth = width * (k / n);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      px = nx;
      py = ny;
    }
  }

  function drawShot(s) {
    const a = AGES[s.age];
    drawTrail(s.trail, s.x, s.y, s.turret && s.age === 2 ? '120,113,108' : TRAIL_COLORS[s.age], s.turret ? 3 : 1.6);
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
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(-11, -2, 3, 4);
    } else if (s.age === 2) {
      ctx.fillStyle = s.turret ? '#1c1917' : '#fde047';
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
      drawTrail(d.trail, d.x, d.y, '34,211,238', 6);
      ctx.save();
      ctx.fillStyle = '#ecfeff';
      ctx.shadowColor = a.glow;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    drawTrail(d.trail, d.x, d.y, d.age === 1 ? '255,255,255' : '249,115,22', d.age === 1 ? 1.5 : 4);
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.age === 1) {
      ctx.rotate(Math.atan2(d.vy, d.vx));
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

  function drawBolt(b) {
    if (b.age === 2) {
      drawTrail(b.trail, b.x, b.y, '231,229,228', 3);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang || Math.PI / 2);
      ctx.fillStyle = '#1c1917';
      roundRect(-8, -3, 16, 6, 3);
      ctx.fill();
      ctx.restore();
      return;
    }
    const big = b.age === 0;
    drawTrail(b.trail, b.x, b.y, '249,115,22', big ? 14 : 9);
    drawTrail(b.trail.slice(-8), b.x, b.y, '253,224,71', big ? 6 : 4);
    const r = big ? 13 : 9;
    ctx.save();
    const halo = ctx.createRadialGradient(b.x, b.y, r * 0.5, b.x, b.y, r * 2.4);
    halo.addColorStop(0, 'rgba(253,186,116,0.9)');
    halo.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(b.x - r * 2.4, b.y - r * 2.4, r * 4.8, r * 4.8);
    ctx.fillStyle = big ? '#57534e' : '#78716c';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(b.x - 2, b.y - 2, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A targeting reticle on the ground: brackets, a ring and a light pillar.
  function drawReticle(x, color, t, label, alpha = 1) {
    const R = ULT.radius;
    ctx.save();
    ctx.globalAlpha = alpha;
    const pillar = ctx.createLinearGradient(0, BAR, 0, GROUND);
    pillar.addColorStop(0, 'rgba(255,255,255,0)');
    pillar.addColorStop(1, color);
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillStyle = pillar;
    ctx.fillRect(x - R, BAR, R * 2, GROUND - BAR);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 2, R, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const s = 10 + Math.sin(t * 8) * 2;
    ctx.lineWidth = 3;
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * (R - s), GROUND - 60);
      ctx.lineTo(x + dx * R, GROUND - 60);
      ctx.lineTo(x + dx * R, GROUND - 60 + s);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, GROUND - 40);
    ctx.lineTo(x, GROUND - 20);
    ctx.moveTo(x - 10, GROUND - 30);
    ctx.lineTo(x + 10, GROUND - 30);
    ctx.stroke();
    if (label) {
      ctx.textAlign = 'center';
      outlined(label, x, GROUND - 72, 'bold 14px system-ui, sans-serif', color);
    }
    ctx.restore();
  }

  function drawStrike(s, t) {
    const color = s.side === 0 ? '#fde047' : '#f87171';
    if (s.t < 0) {
      const label = s.side === 0 ? AGES[s.age].ult : `Incoming: ${AGES[s.age].ult}!`;
      drawReticle(s.x, color, t, label, 0.6 + 0.4 * Math.abs(Math.sin(t * 10)));
      if (s.age === 3) {
        ctx.strokeStyle = 'rgba(165,243,252,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + rand(-2, 2), -MARGIN);
        ctx.lineTo(s.x, GROUND);
        ctx.stroke();
      }
      return;
    }
    if (s.age !== 3 || s.bx === undefined) return;
    // The orbital beam.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wob = Math.sin(t * 40) * 3;
    for (const [w, c] of [[60 + wob, 'rgba(34,211,238,0.18)'], [30, 'rgba(103,232,249,0.45)'], [12, 'rgba(236,254,255,0.95)']]) {
      ctx.fillStyle = c;
      ctx.fillRect(s.bx - w / 2, -MARGIN, w, GROUND + MARGIN);
    }
    const g = ctx.createRadialGradient(s.bx, GROUND, 4, s.bx, GROUND, 70);
    g.addColorStop(0, 'rgba(236,254,255,0.9)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.bx - 70, GROUND - 70, 140, 140);
    ctx.restore();
  }

  function drawDecal(d) {
    const f = d.life / d.max;
    ctx.fillStyle = `rgba(20,12,8,${0.45 * Math.min(1, f * 3)})`;
    ctx.beginPath();
    ctx.ellipse(d.x, GROUND + 4, d.r, d.r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const hot = (d.life - (d.max - 1.2 * d.glow)) / 1.2;
    if (hot > 0) {
      ctx.fillStyle = `rgba(249,115,22,${0.5 * hot})`;
      ctx.beginPath();
      ctx.ellipse(d.x, GROUND + 3, d.r * 0.6, d.r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of state.parts) {
      const f = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'flash' || p.kind === 'ember') continue;
      if (p.kind === 'spark') {
        ctx.globalAlpha = f;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === 'puff') {
        ctx.globalAlpha = (p.alpha || 0.5) * f;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + (1 - f) * 0.8), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = f;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    // Glowing particles add light.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.parts) {
      const f = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'flash') {
        const r = p.size * (1.3 - f * 0.5);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = f;
        ctx.fillStyle = g;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.kind === 'ember') {
        ctx.globalAlpha = f * (0.6 + 0.4 * Math.random());
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Rendering: one frame
  // ---------------------------------------------------------------------------

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.textBaseline = 'alphabetic';
    if (!state) return;
    const t = performance.now() / 1000;
    const me = state.sides[0];

    ctx.save();
    // Camera: zoom in on the falling castle, then shake.
    const e = state.ending;
    if (e) {
      const z = 1 + 0.3 * ease(e.t / 1.2);
      const cy = GROUND - 70;
      ctx.translate(e.x, cy);
      ctx.scale(z, z);
      ctx.translate(-e.x, -cy);
    }
    if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawWorldBackground(t);
    state.decals.forEach(drawDecal);
    state.sides.forEach(drawBase);
    state.corpses.forEach(drawCorpse);
    state.units.forEach(drawUnit);
    state.shots.forEach(drawShot);
    state.drops.forEach(drawDrop);
    state.bolts.forEach(drawBolt);
    for (const st of state.strikes) drawStrike(st, t);
    drawParticles();
    ctx.textAlign = 'center';
    for (const tx of state.texts) {
      const f = tx.life / tx.max;
      const pop = 1 + 0.5 * clamp((f - 0.8) / 0.2, 0, 1);
      ctx.globalAlpha = clamp(f * 1.5, 0, 1);
      outlined(tx.text, tx.x, tx.y, `bold ${Math.round(13 * tx.scale * pop)}px system-ui, sans-serif`, tx.color);
    }
    ctx.globalAlpha = 1;
    if (ui.mode === 'ult' && state.mode === 'playing') {
      drawReticle(ultAim(), '#fde047', t, `${AGES[me.age].ult} · click to fire`);
    }
    ctx.restore();

    if (state.flash > 0) {
      ctx.globalAlpha = Math.min(1, state.flash) * 0.6;
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const cinematic = state.mode === 'intro' || state.mode === 'ending';
    if (state.bars > 0) {
      const b = ease(state.bars);
      ctx.fillStyle = '#000';
      if (cinematic) {
        ctx.fillRect(0, 0, W, 56 * b);
        ctx.fillRect(0, H - 56 * b, W, 56 * b);
      } else {
        ctx.fillRect(0, BAR, W, 22 * b);
        ctx.fillRect(0, H - 30 * b, W, 30 * b);
      }
    }
    if (state.mode === 'menu') return;
    if (!cinematic) {
      if (ui.mode === 'build' || ui.mode === 'sell') drawSlotPicker();
      drawHud();
    } else {
      drawSysButtons(hitTest(ui.mx, ui.my));
    }
    drawCards(t);
    drawSpeech();
    if (state.hint && state.mode === 'playing') drawHint();
    if (state.tut && state.mode === 'playing') drawTutorial(t);
    if (state.mode === 'intro') drawIntro(t);
  }

  // The cached battlefield, with the light sweep of an age-up, plus live ambience.
  function drawWorldBackground(t) {
    const key = fieldKey();
    const sw = state.sweep;
    if (sw && sw.from !== key) {
      const p = clamp(sw.t / sw.dur, 0, 1);
      const p2 = p * p * (3 - 2 * p);
      const span = MID + 200 + MARGIN;
      const edge = sw.side === 0 ? -MARGIN + span * p2 : W + MARGIN - span * p2;
      drawField(sw.from);
      ctx.save();
      ctx.beginPath();
      if (sw.side === 0) ctx.rect(-MARGIN, -MARGIN, edge + MARGIN, H + MARGIN * 2);
      else ctx.rect(edge, -MARGIN, W + MARGIN - edge, H + MARGIN * 2);
      ctx.clip();
      drawField(key);
      ctx.restore();
      // The bright wipe itself.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.sin(p * Math.PI);
      const g = ctx.createLinearGradient(edge - 90, 0, edge + 90, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.85)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(edge - 90, -MARGIN, 180, H + MARGIN * 2);
      ctx.restore();
    } else {
      drawField(key);
    }
    drawAmbient(state.sides[0].age, -MARGIN, MID, t);
    drawAmbient(state.sides[1].age, MID, W + MARGIN, t);
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

  function wrapText(text, maxW, font) {
    ctx.font = font;
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Big title cards: age names, ultimates, Fight!, Victory and Defeat.
  function drawCards() {
    for (const c of state.cards) {
      const fin = clamp(c.t / 0.3, 0, 1);
      const fout = c.dur > 50 ? 1 : clamp((c.dur - c.t) / 0.5, 0, 1);
      const a = Math.min(fin, fout);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      if (c.kind === 'enemy') {
        const y = BAR + 44;
        ctx.font = 'bold 20px system-ui, sans-serif';
        const w = ctx.measureText(c.title).width + 60;
        ctx.fillStyle = 'rgba(69,10,10,0.75)';
        roundRect(W / 2 - w / 2, y - 24, w, c.sub ? 50 : 34, 10);
        ctx.fill();
        outlined(c.title, W / 2, y, 'bold 20px system-ui, sans-serif', '#fecaca');
        if (c.sub) outlined(c.sub, W / 2, y + 18, '12px system-ui, sans-serif', '#fde2e2');
      } else {
        const big = { age: 56, ult: 42, fight: 70, win: 80, lose: 80 }[c.kind] || 40;
        const y = c.kind === 'ult' ? 200 : 236;
        const scale = 1 + (1 - ease(fin)) * 0.6;
        // A dark band behind the title.
        const band = ctx.createLinearGradient(0, 0, W, 0);
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(0.5, 'rgba(0,0,0,0.5)');
        band.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = band;
        ctx.fillRect(0, y - big - 10, W, big + (c.sub ? 46 : 26));
        ctx.translate(W / 2, y - big * 0.35);
        ctx.scale(scale, scale);
        const grad = ctx.createLinearGradient(0, -big * 0.7, 0, big * 0.2);
        const col = {
          age: ['#fef9c3', '#f59e0b'], ult: ['#fff7ed', AGES[state.sides[0].age].glow],
          fight: ['#ffffff', '#fca5a5'], win: ['#fef9c3', '#eab308'], lose: ['#fecaca', '#b91c1c'],
        }[c.kind] || ['#fff', '#d6d3d1'];
        grad.addColorStop(0, col[0]);
        grad.addColorStop(1, col[1]);
        ctx.font = `900 ${big}px system-ui, sans-serif`;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        const title = c.title.toUpperCase();
        ctx.strokeText(title, 0, big * 0.35);
        ctx.fillStyle = grad;
        ctx.fillText(title, 0, big * 0.35);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
        if (c.sub) {
          ctx.globalAlpha = a * clamp((c.t - 0.3) / 0.3, 0, 1);
          outlined(c.sub, W / 2, y + 24, '600 15px system-ui, sans-serif', '#fef3c7');
        }
        if (c.kind === 'age') {
          // Lines that stretch out from the title.
          const lw = 360 * ease(c.t / 0.8);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(W / 2 - lw, y + 34, lw * 2, 2);
          ctx.fillRect(W / 2 - lw, y - big - 4, lw * 2, 2);
        }
      }
      ctx.restore();
    }
  }

  // The rival general's taunts, with their portrait.
  function drawSpeech() {
    const sp = state.speech;
    if (!sp || !state.general) return;
    const a = clamp(Math.min(sp.t / 0.25, (sp.dur - sp.t) / 0.4), 0, 1);
    const g = state.general;
    const r = 26;
    const cx = W - 46 + (1 - a) * 60;
    const cy = BAR + 48;
    ctx.save();
    ctx.globalAlpha = a;
    const lines = wrapText(sp.text, 250, '600 13px system-ui, sans-serif');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
    const h = lines.length * 17 + 26;
    const bx = cx - r - 12 - w;
    const by = cy - h / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(bx, by, w, h, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + w, cy - 6);
    ctx.lineTo(bx + w + 10, cy);
    ctx.lineTo(bx + w, cy + 6);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = g.color;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(g.name, bx + 12, by + 16);
    ctx.fillStyle = '#1c1917';
    ctx.font = '600 13px system-ui, sans-serif';
    lines.forEach((l, k) => ctx.fillText(l, bx + 12, by + 33 + k * 17));
    drawPortrait(ctx, g.look, cx, cy, r, g.color);
    ctx.restore();
  }

  function drawHint() {
    const hint = state.hint;
    const a = clamp(Math.min(hint.t / 0.4, (7 - hint.t) / 0.4), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 13px system-ui, sans-serif';
    const w = ctx.measureText(hint.text).width + 64;
    const x = W / 2 - w / 2;
    const y = H - 40;
    ctx.fillStyle = 'rgba(12,10,9,0.78)';
    roundRect(x, y, w, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    roundRect(x + 6, y + 5, 36, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TIP', x + 24, y + 18);
    ctx.fillStyle = '#fff';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(hint.text, x + 50, y + 19);
    ctx.restore();
  }

  function drawTutorial(t) {
    const L = tutLayout();
    const tile = L.tile;
    const bounce = Math.sin(t * 6) * 3;
    ctx.save();
    // Arrow up to the tile.
    const ax = tile.x + tile.w / 2;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(ax, tile.y + tile.h + 2 + bounce);
    ctx.lineTo(ax - 9, L.y + bounce * 0.3);
    ctx.lineTo(ax + 9, L.y + bounce * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(12,10,9,0.9)';
    roundRect(L.x, L.y, L.w, L.h, 10);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`TUTORIAL ${state.tut.step + 1}/${TUTORIAL.length}`, L.x + 12, L.y + 15);
    ctx.fillStyle = '#fff';
    const lines = wrapText(L.text, L.w - 24, '600 12px system-ui, sans-serif');
    lines.slice(0, 2).forEach((l, k) => ctx.fillText(l, L.x + 12, L.y + 31 + k * 15));
    const hot = inside(L.skip, ui.mx, ui.my);
    ctx.fillStyle = hot ? '#fff' : '#a8a29e';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Skip tutorial ›', L.skip.x + L.skip.w, L.skip.y + 13);
    ctx.restore();
  }

  // Stage intro: the two commanders trade words before battle.
  function drawIntro(t) {
    const g = state.general;
    const it = state.intro;
    const line = g.intro[it.i];
    const genTalks = line[0] === 'gen';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    outlined(`Stage ${state.stage + 1} of ${GENERALS.length}`, W / 2, 24, '600 13px system-ui, sans-serif', '#d6d3d1');
    outlined(`${g.name} ${g.title}`, W / 2, 48, 'bold 22px system-ui, sans-serif', '#fff');

    const slide = ease(clamp((it.t || 0) / 0.5, 0, 1));
    const pr = [
      { look: PLAYER_LOOK, color: PLAYER_LOOK.color, x: 170 - (1 - slide) * 200, on: !genTalks, name: 'You' },
      { look: g.look, color: g.color, x: W - 170 + (1 - slide) * 200, on: genTalks, name: g.name },
    ];
    for (const p of pr) {
      ctx.globalAlpha = p.on ? 1 : 0.45;
      drawPortrait(ctx, p.look, p.x, 250, p.on ? 92 : 74, p.color);
      ctx.globalAlpha = 1;
      outlined(p.name, p.x, 250 + (p.on ? 92 : 74) + 22, 'bold 16px system-ui, sans-serif', p.on ? '#fff' : '#a8a29e');
    }

    // Dialogue box with typewriter text.
    const bx = 290;
    const bw = 420;
    const by = 330;
    const bh = 120;
    ctx.fillStyle = 'rgba(12,10,9,0.88)';
    roundRect(bx, by, bw, bh, 12);
    ctx.fill();
    ctx.strokeStyle = genTalks ? g.color : PLAYER_LOOK.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = genTalks ? '#fecaca' : '#bfdbfe';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(genTalks ? g.name : 'You', bx + 16, by + 22);
    const shown = line[1].slice(0, Math.floor(it.chars));
    const lines = wrapText(shown, bw - 32, '600 18px system-ui, sans-serif');
    ctx.fillStyle = '#fff';
    lines.forEach((l, k) => ctx.fillText(l, bx + 16, by + 48 + k * 24));
    if (it.chars >= line[1].length && Math.sin(t * 5) > -0.3) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a8a29e';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(it.i < g.intro.length - 1 ? 'Click or press Space ›' : 'Click or press Space to fight ›', bx + bw - 14, by + bh - 12);
    }
    // Skip button.
    const hot = inside(INTRO_SKIP, ui.mx, ui.my);
    ctx.fillStyle = hot ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)';
    roundRect(INTRO_SKIP.x, INTRO_SKIP.y, INTRO_SKIP.w, INTRO_SKIP.h, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('Skip intro ›', INTRO_SKIP.x + INTRO_SKIP.w / 2, INTRO_SKIP.y + 16);
    ctx.restore();
  }

  // --- Portraits -------------------------------------------------------------------

  // A general's face, drawn on any 2D context (the main canvas or a menu card).
  function drawPortrait(g, look, cx, cy, r, color) {
    const u = r / 50;
    const ell = (x, y, rx, ry, col, rot = 0, a0 = 0, a1 = Math.PI * 2) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(cx + x * u, cy + y * u, rx * u, ry * u, rot, a0, a1);
      g.fill();
    };
    const poly = (pts, col) => {
      g.fillStyle = col;
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(cx + x * u, cy + y * u) : g.moveTo(cx + x * u, cy + y * u)));
      g.closePath();
      g.fill();
    };
    const line = (pts, col, w) => {
      g.strokeStyle = col;
      g.lineWidth = w * u;
      g.lineCap = 'round';
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(cx + x * u, cy + y * u) : g.moveTo(cx + x * u, cy + y * u)));
      g.stroke();
    };
    const st = look.style;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    const bg = g.createRadialGradient(cx, cy - r * 0.4, r * 0.1, cx, cy, r);
    bg.addColorStop(0, color);
    bg.addColorStop(1, '#0c0a09');
    g.fillStyle = bg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Shoulders and armour.
    const armour = { wild: '#78350f', helm: '#64748b', tophat: '#292524', flame: '#7f1d1d', horns: '#44403c', hood: '#1e1b4b', cap: '#1e3a8a' }[st];
    ell(0, 56, 46, 28, armour);
    if (st === 'helm' || st === 'horns') {
      ell(-30, 40, 14, 9, '#94a3b8');
      ell(30, 40, 14, 9, '#94a3b8');
    }
    if (st === 'wild') line([[-20, 34], [0, 44], [20, 34]], '#f5f5f4', 3);
    if (st === 'tophat') poly([[-8, 30], [8, 30], [0, 44]], '#f5f5f4');
    if (look.extra === 'medal') {
      ell(14, 46, 4, 4, '#facc15');
      poly([[11, 36], [17, 36], [16, 42], [12, 42]], '#dc2626');
    }
    ell(0, 22, 9, 12, look.skin); // neck

    // Back hair and hoods.
    if (st === 'hood') ell(0, -6, 36, 44, '#312e81');
    if (st === 'wild') {
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const a = Math.PI * 0.95 + (k / 16) * Math.PI * 1.1;
        const rr = k % 2 ? 30 : 40;
        pts.push([Math.cos(a) * rr, -6 + Math.sin(a) * rr]);
      }
      pts.push([30, 14], [-30, 14]);
      poly(pts, look.hair);
    }
    if (look.extra === 'braids') {
      ell(-22, 18, 6, 22, look.hair);
      ell(22, 18, 6, 22, look.hair);
    }
    if (st === 'flame') {
      ell(-20, 8, 9, 24, look.hair);
      ell(20, 8, 9, 24, look.hair);
    }

    // Head.
    ell(-21, -2, 4, 6, look.skin);
    ell(21, -2, 4, 6, look.skin);
    ell(0, -4, 22, 27, look.skin);
    ell(0, 4, 18, 14, 'rgba(0,0,0,0.06)');

    // Eyes.
    if (look.extra === 'eyes') {
      g.save();
      g.shadowColor = '#c084fc';
      g.shadowBlur = 12 * u;
      ell(-8, -6, 5, 2.4, '#e9d5ff', -0.2);
      ell(8, -6, 5, 2.4, '#e9d5ff', 0.2);
      g.restore();
    } else {
      for (const ex of [-8, 8]) {
        ell(ex, -6, 4.2, 2.8, '#fff');
        ell(ex + 0.8, -6, 2, 2.2, '#1c1917');
      }
    }

    // Brows.
    const brow = '#292524';
    if (look.brow === 'uni') line([[-14, -13], [-4, -10], [4, -10], [14, -13]], look.hair, 4);
    else if (look.brow === 'stern') { line([[-13, -13], [-4, -11]], brow, 2.5); line([[13, -13], [4, -11]], brow, 2.5); }
    else if (look.brow === 'raised') { line([[-13, -12], [-4, -12]], '#a8a29e', 2.5); line([[4, -15], [13, -17]], '#a8a29e', 2.5); }
    else if (look.brow === 'sharp') { line([[-13, -14], [-4, -10]], '#7f1d1d', 2.5); line([[13, -14], [4, -10]], '#7f1d1d', 2.5); }
    else if (look.brow === 'heavy') { line([[-14, -14], [-3, -10]], brow, 4.5); line([[14, -14], [3, -10]], brow, 4.5); }

    // Nose and mouth.
    if (look.extra !== 'eyes') {
      line([[0, -4], [-2, 4], [1, 5]], 'rgba(0,0,0,0.3)', 1.6);
      if (st === 'flame') line([[-6, 13], [2, 14], [8, 10]], '#7f1d1d', 2);
      else if (st === 'cap') line([[-6, 12], [0, 14], [6, 12]], '#7f1d1d', 2);
      else line([[-7, 13], [7, 13]], '#7f1d1d', 2);
    }

    // Beards.
    if (look.beard && st !== 'tophat') {
      poly([[-21, 0], [-18, 20], [-8, 32], [0, 36], [8, 32], [18, 20], [21, 0], [14, 10], [8, 16], [-8, 16], [-14, 10]], look.beard);
      line([[-7, 13], [7, 13]], '#450a0a', 2);
    }
    if (st === 'tophat') {
      // A curly moustache.
      line([[0, 9], [-6, 11], [-12, 8], [-13, 5]], look.beard, 3);
      line([[0, 9], [6, 11], [12, 8], [13, 5]], look.beard, 3);
    }

    // Hair, hats and helmets in front.
    if (st === 'wild') {
      poly([[-22, -14], [-16, -30], [-10, -18], [-4, -32], [2, -18], [9, -31], [13, -18], [20, -28], [22, -12], [0, -24]], look.hair);
      g.save();
      g.translate(cx + 2 * u, cy - 30 * u);
      g.rotate(-0.4);
      g.fillStyle = '#f5f5f4';
      g.fillRect(-16 * u, -2.5 * u, 32 * u, 5 * u);
      for (const bx of [-16, 16]) {
        g.beginPath();
        g.arc(bx * u, -3 * u, 4 * u, 0, Math.PI * 2);
        g.arc(bx * u, 3 * u, 4 * u, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else if (st === 'helm') {
      ell(0, -16, 25, 22, '#94a3b8', 0, Math.PI, 0);
      poly([[-25, -16], [25, -16], [24, -10], [-24, -10]], '#64748b');
      poly([[-2, -14], [2, -14], [2, 2], [-2, 2]], '#64748b');
      ell(0, -38, 4, 4, '#e2e8f0');
      poly([[-3, -40], [3, -40], [10, -60], [-6, -58]], '#dc2626');
    } else if (st === 'tophat') {
      ell(-21, -10, 7, 10, look.hair);
      ell(21, -10, 7, 10, look.hair);
      ell(0, -24, 32, 6, '#111');
      poly([[-18, -24], [18, -24], [17, -64], [-17, -64]], '#1c1917');
      poly([[-18, -30], [18, -30], [18, -36], [-18, -36]], '#a16207');
      g.strokeStyle = '#facc15';
      g.lineWidth = 1.6 * u;
      g.beginPath();
      g.arc(cx + 8.5 * u, cy - 6 * u, 6 * u, 0, Math.PI * 2);
      g.stroke();
      line([[14, -4], [18, 12], [16, 26]], '#facc15', 1);
    } else if (st === 'flame') {
      const flames = [[-20, -14, -26, -40], [-10, -22, -12, -50], [0, -24, 2, -56], [10, -22, 16, -48], [20, -14, 28, -38]];
      for (const [x0, y0, x1, y1] of flames) poly([[x0 - 8, y0 + 6], [x1, y1], [x0 + 8, y0 + 6]], look.hair);
      ell(0, -20, 23, 9, look.hair);
      for (const gx of [-9, 9]) {
        ell(gx, -24, 8, 7, '#44403c');
        ell(gx, -24, 5.5, 5, '#67e8f9');
      }
      line([[-22, -24], [22, -24]], '#44403c', 2);
      for (const [fx2, fy2] of [[-12, 2], [-9, 4], [10, 3], [13, 1]]) ell(fx2, fy2, 1, 1, '#9a3412');
    } else if (st === 'horns') {
      ell(0, -14, 25, 22, '#44403c', 0, Math.PI, 0);
      poly([[-25, -14], [25, -14], [24, -8], [-24, -8]], '#292524');
      for (const sgn of [-1, 1]) {
        g.fillStyle = '#e7e5e4';
        g.beginPath();
        g.moveTo(cx + sgn * 20 * u, cy - 20 * u);
        g.quadraticCurveTo(cx + sgn * 46 * u, cy - 26 * u, cx + sgn * 40 * u, cy - 54 * u);
        g.quadraticCurveTo(cx + sgn * 36 * u, cy - 32 * u, cx + sgn * 18 * u, cy - 28 * u);
        g.fill();
      }
      line([[-14, -16], [-6, 2]], '#b91c1c', 2);
    } else if (st === 'hood') {
      poly([[-36, 30], [-30, -30], [0, -52], [30, -30], [36, 30], [22, 30], [22, -12], [0, -30], [-22, -12], [-22, 30]], '#312e81');
      line([[-22, -12], [0, -30], [22, -12]], '#4c1d95', 2);
    } else if (st === 'cap') {
      ell(-20, -8, 5, 9, look.hair);
      ell(20, -8, 5, 9, look.hair);
      poly([[-24, -18], [24, -18], [22, -38], [-22, -38]], '#1e3a8a');
      ell(0, -38, 23, 8, '#1e40af');
      poly([[-26, -18], [26, -18], [20, -12], [-20, -12]], '#0f172a');
      ell(0, -28, 5, 5, '#facc15');
    }
    g.restore();
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, r * 0.07);
    g.beginPath();
    g.arc(cx, cy, r - g.lineWidth / 2, 0, Math.PI * 2);
    g.stroke();
  }

  // --- HUD -----------------------------------------------------------------------

  function drawHud() {
    const me = state.sides[0];
    const a = AGES[me.age];
    const hover = hitTest(ui.mx, ui.my);

    // Bar background.
    const bg = ctx.createLinearGradient(0, 0, 0, BAR);
    bg.addColorStop(0, 'rgba(12,10,9,0.78)');
    bg.addColorStop(1, 'rgba(12,10,9,0.58)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, BAR - 1, W, 1);

    // Stats: gold, age, XP, training queue.
    ctx.textAlign = 'left';
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
    ctx.fillText(`${a.name}${me.level ? ` · Lv ${me.level}` : ''}`, 254, 27);

    const xpFrac = a.xpNext === Infinity ? 1 : clamp(me.xp / a.xpNext, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(14, 36, 240, 10, 5);
    ctx.fill();
    ctx.fillStyle = canEvolve(me) ? '#4ade80' : '#60a5fa';
    roundRect(14, 36, Math.max(10, 240 * xpFrac), 10, 5);
    ctx.fill();
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(a.xpNext === Infinity ? `XP ${Math.floor(me.xp)}` : `XP ${Math.floor(me.xp)} / ${a.xpNext}`, 134, 44.5);

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
    ctx.fillStyle = '#a8a29e';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(`${me.queue.length}/${MAX_QUEUE}`, 196, 67);

    // Action tiles.
    const tutTarget = state.tut ? TUTORIAL[state.tut.step].target : null;
    for (const t of hudTiles()) {
      const hot = hover && hover.kind === 'tile' && hover.item.id === t.id;
      if (t.id === tutTarget) t.glow = true;
      drawTile(t, hot);
    }

    drawSysButtons(hover);
    const label = state.kind === 'campaign'
      ? `Stage ${state.stage + 1}`
      : `${state.difficulty[0].toUpperCase()}${state.difficulty.slice(1)}`;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (state.overtime) {
      ctx.fillStyle = '#f87171';
      ctx.fillText(`Overtime ×${overtimeMult().toFixed(1)} · ${formatTime(state.t)}`, SYS.x0 + 58, 64);
    } else {
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(`${label} · ${formatTime(state.t)}`, SYS.x0 + 58, 64);
    }

    // Mode banner.
    if (ui.mode && state.mode === 'playing') {
      const msg = {
        build: 'Pick a slot on your castle (1–3) · Esc or right-click to cancel',
        sell: 'Pick a turret to sell (1–3) · Esc or right-click to cancel',
        ult: `Aim ${a.ult}: click the battlefield (or press R) · Esc to cancel`,
      }[ui.mode];
      ctx.font = '600 13px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 24;
      ctx.fillStyle = ui.mode === 'ult' ? 'rgba(113,63,18,0.85)' : 'rgba(12,10,9,0.7)';
      roundRect(W / 2 - w / 2, BAR + 10, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(msg, W / 2, BAR + 27);
    }

    // Tooltip.
    if (hover && (hover.kind === 'tile' || hover.kind === 'sys' || hover.kind === 'slot')) {
      const lines = hover.kind === 'slot' ? slotTip(hover.item.slot) : hover.item.tip;
      const anchorX = hover.kind === 'slot' ? hover.item.cx + 24 : hover.item.x;
      const anchorY = hover.kind === 'slot' ? hover.item.cy - 20 : BAR + (ui.mode ? 44 : 8);
      drawTooltip(lines, anchorX, anchorY);
    }
    const clickable = hover && (hover.kind !== 'tile' || hover.item.enabled || hover.item.active);
    canvas.style.cursor = ui.mode === 'ult' && hover && hover.kind === 'field' ? 'crosshair' : clickable ? 'pointer' : 'default';
  }

  function drawSysButtons(hover) {
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
  }

  function drawTile(t, hot) {
    const enabled = t.enabled || t.active;
    const now = performance.now();
    ctx.save();
    ctx.globalAlpha = enabled || t.glow ? 1 : 0.5;
    ctx.fillStyle = t.active ? '#dbeafe' : hot && enabled ? '#ffffff' : 'rgba(255,255,255,0.86)';
    if (t.ult && t.charge >= 1) ctx.fillStyle = hot ? '#fffbeb' : '#fef3c7';
    roundRect(t.x, t.y, t.w, t.h, 8);
    ctx.fill();
    if (t.active || t.glow) {
      const pulse = t.glow ? 0.5 + 0.5 * Math.sin(now / 200) : 1;
      ctx.strokeStyle = t.active ? '#2563eb' : t.ult ? `rgba(245,158,11,${0.5 + pulse * 0.5})` : `rgba(74,222,128,${0.5 + pulse * 0.5})`;
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

    // Ultimate charge ring.
    if (t.ult) {
      const cx = t.x + t.w / 2;
      const cy = t.y + 24;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = t.charge >= 1 ? '#f59e0b' : '#d97706';
      ctx.beginPath();
      ctx.arc(cx, cy, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.charge);
      ctx.stroke();
    }
    // Training progress / XP progress strip.
    const strip = t.progress >= 0 ? t.progress : t.fill;
    if (strip !== undefined && strip >= 0 && strip < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(t.x + 5, t.y + t.h - 19, t.w - 10, 3);
      ctx.fillStyle = t.progress >= 0 ? '#2563eb' : '#22c55e';
      ctx.fillRect(t.x + 5, t.y + t.h - 19, (t.w - 10) * strip, 3);
    }
    if (t.count) {
      ctx.fillStyle = '#2563eb';
      roundRect(t.x + 3, t.y + 3, 20, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`×${t.count}`, t.x + 13, t.y + 13.5);
    }
    if (t.cooldown > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t.x, t.y, t.w, t.h * t.cooldown);
    }

    ctx.fillStyle = '#1c1917';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.cost, t.x + t.w / 2, t.y + t.h - 5);
    // Hotkey cap.
    ctx.fillStyle = 'rgba(28,25,23,0.75)';
    roundRect(t.x + t.w - 17, t.y + 3, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillText(t.key, t.x + t.w - 10, t.y + 13.5);
    ctx.restore();
  }

  function drawTooltip(lines, x, y) {
    const w = Math.max(...lines.map((l, i) => {
      ctx.font = i === 0 ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif';
      return ctx.measureText(l).width;
    })) + 20;
    const h = lines.length * 17 + 12;
    x = clamp(x, 6, W - w - 6);
    y = clamp(y, BAR + 4, H - h - 6);
    ctx.fillStyle = 'rgba(12,10,9,0.9)';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      ctx.font = i === 0 ? 'bold 13px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillStyle = i === 0 ? '#fff' : l.startsWith('Strong vs') ? '#86efac' : '#d6d3d1';
      ctx.fillText(l, x + 10, y + 20 + i * 17);
    });
  }

  function drawSlotPicker() {
    const me = state.sides[0];
    const hover = hitTest(ui.mx, ui.my);
    const t = performance.now() / 1000;
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
      if (hot && ui.mode === 'build' && me.open[k] && (!tur || tur.age < me.age)) {
        // Preview: a ghost turret and its reach along the lane.
        const range = SLOTS[k].range;
        const x0 = front(me);
        const g = ctx.createLinearGradient(x0, 0, x0 + range, 0);
        g.addColorStop(0, 'rgba(74,222,128,0.35)');
        g.addColorStop(1, 'rgba(74,222,128,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, GROUND - 8, range, 10);
        ctx.save();
        ctx.strokeStyle = 'rgba(74,222,128,0.8)';
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -t * 30;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.cx, s.cy);
        ctx.quadraticCurveTo(x0 + range * 0.5, s.cy - 50, x0 + range, GROUND - 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0 + range, GROUND - 60);
        ctx.lineTo(x0 + range, GROUND);
        ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'center';
        outlined(`Range ${range}`, x0 + range, GROUND - 66, 'bold 12px system-ui, sans-serif', '#bbf7d0');
        ctx.globalAlpha = 0.6;
        drawTurret({ x: s.cx, y: s.cy }, me.age, -0.25);
        ctx.globalAlpha = 1;
      }
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

  function drawUltIcon(x, y, age, charge) {
    const cy = y - 20;
    ctx.save();
    if (age === 3) {
      ctx.fillStyle = '#0e7490';
      ctx.fillRect(x - 3, cy - 14, 6, 26);
      ctx.fillStyle = '#a5f3fc';
      ctx.fillRect(x - 1.5, cy - 14, 3, 26);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x - 9, cy - 16, 18, 5);
    } else {
      // A blazing projectile.
      ctx.fillStyle = age === 2 ? '#78716c' : '#f97316';
      ctx.beginPath();
      ctx.moveTo(x - 12, cy - 12);
      ctx.lineTo(x + 2, cy - 2);
      ctx.lineTo(x - 4, cy + 4);
      ctx.fill();
      ctx.fillStyle = age === 2 ? '#1c1917' : '#57534e';
      ctx.beginPath();
      ctx.arc(x + 2, cy + 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (charge < 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 20, cy - 20, 40, 40 * (1 - charge));
    }
    ctx.restore();
  }

  function drawEvolveIcon(x, y, age) {
    // The next age's heavy unit, behind a star.
    if (age < AGES.length - 1) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawUnitIcon(x + 8, y + 2, age + 1, 2, 0.7);
      ctx.restore();
    }
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 6 : 14;
      const ang = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx.lineTo(x - 4 + Math.cos(ang) * r, y - 17 + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Overlays (menu, campaign, settings, pause, results) and input
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');
  let selectedStage = 0;
  let settingsBack = 'menu';

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const KEYS_HELP = '1 2 3 train · T turret · S sell · U upgrade · Q special · R ultimate · E evolve · P pause · M mute · F fullscreen';
  const starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const totalStars = () => save.stars.reduce((a, b) => a + b, 0);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function diffButtons() {
    const info = { easy: 'A gentle warm-up', normal: 'A fair fight', hard: 'Richer, faster, meaner' };
    return Object.keys(DIFFICULTY).map((d) =>
      `<button type="button" data-start="${d}" class="${d === save.difficulty ? 'primary' : ''}">${cap(d)}<small>${info[d]}</small></button>`,
    ).join('');
  }

  function stageDetail(k) {
    const g = GENERALS[k];
    const open = stageOpen(k);
    return `
      <div class="nw-detail">
        <p><b>Stage ${k + 1}: ${g.name} ${g.title}</b> · <span class="nw-tag">${g.tag}</span></p>
        <p>${open ? g.blurb : `Beat ${GENERALS[k - 1].name} to unlock.`}</p>
        <p class="help">★ Win · ★ Keep your castle above half health · ★ Win within ${formatTime(g.par)}</p>
        <button type="button" class="primary" data-act="fight" ${open ? '' : 'disabled'}>Fight ${g.name}</button>
      </div>`;
  }

  function showOverlay(kind) {
    stage.classList.toggle('nw-open', !!kind);
    if (!kind) {
      overlay.classList.remove('open', 'light');
      overlay.innerHTML = '';
      return;
    }
    overlay.classList.toggle('light', kind === 'menu' || kind === 'over');
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2 class="nw-title">Nameless War</h2>
          <p>Train an army, evolve through four ages and bring down the enemy castle.</p>
          <div class="row">
            <button type="button" class="primary big" data-act="campaign">Campaign<small>${totalStars()} / ${GENERALS.length * 3} ★</small></button>
            <button type="button" class="big" data-act="skirmish">Skirmish<small>Quick battle</small></button>
          </div>
          <div class="row">
            <button type="button" data-act="settings">Settings</button>
            <button type="button" data-act="tutorial">Tutorial</button>
          </div>
          <p class="help">${KEYS_HELP}</p>
        </div>`;
    } else if (kind === 'skirmish') {
      overlay.innerHTML = `
        <div>
          <h2>Skirmish</h2>
          <p>Pick a difficulty.</p>
          <div class="row">${diffButtons()}</div>
          <div class="row"><button type="button" data-act="menu">Back</button></div>
        </div>`;
    } else if (kind === 'campaign') {
      const cards = GENERALS.map((g, k) => {
        const open = stageOpen(k);
        return `
          <button type="button" class="nw-card${open ? '' : ' locked'}${k === selectedStage ? ' sel' : ''}" data-stage="${k}">
            <canvas class="nw-portrait" data-gen="${k}"></canvas>
            <span class="nw-name">${g.name}</span>
            <span class="nw-sub">${open ? g.tag : 'Locked'}</span>
            <span class="nw-stars">${starsText(save.stars[k])}</span>
          </button>`;
      }).join('');
      overlay.innerHTML = `
        <div class="nw-wide">
          <h2>Campaign</h2>
          <p class="help">Six rival generals, each tougher than the last. ${totalStars()} / ${GENERALS.length * 3} ★</p>
          <div class="nw-grid">${cards}</div>
          ${stageDetail(selectedStage)}
          <div class="row"><button type="button" data-act="menu">Back</button></div>
        </div>`;
      drawCardPortraits();
    } else if (kind === 'settings') {
      const onOff = (v) => (v ? 'On' : 'Off');
      overlay.innerHTML = `
        <div>
          <h2>Settings</h2>
          <div class="nw-settings">
            <button type="button" data-set="shake">Screen shake: <b>${onOff(save.shake)}</b></button>
            <button type="button" data-set="effects">Effects: <b>${save.effects === 'full' ? 'Full' : 'Reduced'}</b></button>
            <button type="button" data-set="hints">Battle tips: <b>${onOff(save.hints)}</b></button>
            <button type="button" data-set="sound">Sound: <b>${onOff(!Sound.muted)}</b></button>
            <button type="button" data-set="tutorial">Tutorial: <b>${save.tutorial ? 'Done (replay)' : 'On next game'}</b></button>
          </div>
          <div class="row"><button type="button" class="primary" data-act="back">Done</button></div>
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div>
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="restart">Restart</button>
            <button type="button" data-act="settings">Settings</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
          <p class="help">${KEYS_HELP}</p>
        </div>`;
    } else if (kind === 'over') {
      const me = state.sides[0];
      const won = state.winner === 0;
      const stats = `Time ${formatTime(state.t)} · Kills ${me.kills} · Reached the ${AGES[me.age].name}`;
      if (state.kind === 'campaign') {
        const g = state.general;
        const r = state.result;
        const crit = ['Win the battle', 'Castle above half health', `Win within ${formatTime(g.par)}`];
        const last = state.stage === GENERALS.length - 1;
        const next = won && !last
          ? `<button type="button" class="primary" data-act="next">Next: ${GENERALS[state.stage + 1].name}</button>` : '';
        overlay.innerHTML = `
          <div>
            <h2>${won ? 'Victory' : 'Defeat'}</h2>
            <p>${won ? (last ? 'The Nameless War is over. You won it.' : `${g.name} has fallen.`) : `${g.name} ${g.title} holds the field.`}</p>
            <p class="nw-bigstars">${r.stars.map((s, k) => `<span class="${s ? 'on' : ''}" style="animation-delay:${0.2 + k * 0.25}s">★</span>`).join('')}</p>
            <p class="help">${crit.map((c, k) => `${r.stars[k] ? '✓' : '✗'} ${c}`).join(' · ')}${r.improved ? ' · <b>New best!</b>' : ''}</p>
            <p>${stats}</p>
            <div class="row">
              ${next}
              <button type="button" class="${won ? '' : 'primary'}" data-act="retry">Retry</button>
              <button type="button" data-act="campaign">Campaign</button>
              <button type="button" data-act="menu">Menu</button>
            </div>
          </div>`;
      } else {
        overlay.innerHTML = `
          <div>
            <h2>${won ? 'Victory' : 'Defeat'}</h2>
            <p>${won ? 'The enemy castle has fallen.' : 'Your castle has fallen.'}</p>
            <p>${stats}</p>
            <div class="row">${diffButtons()}</div>
            <div class="row"><button type="button" data-act="menu">Menu</button></div>
          </div>`;
      }
    }
    overlay.classList.add('open');
  }

  // Portraits on the campaign cards, drawn into their own small canvases.
  function drawCardPortraits() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    overlay.querySelectorAll('canvas[data-gen]').forEach((c) => {
      const k = Number(c.dataset.gen);
      const size = c.clientWidth || 64;
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!stageOpen(k)) g.globalAlpha = 0.3;
      drawPortrait(g, GENERALS[k].look, size / 2, size / 2, size / 2 - 1, GENERALS[k].color);
    });
  }

  // The menu sits over a live demo battle.
  function showMenu() {
    newGame({ kind: 'demo' });
    showOverlay('menu');
  }

  function start(d) {
    if (!DIFFICULTY[d]) d = 'normal';
    save.difficulty = d;
    storeSave();
    newGame({ kind: 'skirmish', difficulty: d });
    showOverlay(null);
    beginBattle();
  }

  function startStage(k, skipIntro) {
    k = clamp(Math.floor(Number(k)) || 0, 0, GENERALS.length - 1);
    selectedStage = k;
    newGame({ kind: 'campaign', stage: k });
    showOverlay(null);
    if (AUTOPLAY || skipIntro) {
      beginBattle();
    } else {
      state.mode = 'intro';
      state.intro = { i: 0, chars: 0, t: 0 };
      Sound.horn();
    }
  }

  function advanceIntro() {
    const it = state.intro;
    const line = state.general.intro[it.i];
    if (it.chars < line[1].length) {
      it.chars = line[1].length;
      return;
    }
    it.i++;
    it.chars = 0;
    Sound.click();
    if (it.i >= state.general.intro.length) beginBattle();
  }

  function beginBattle() {
    state.mode = 'playing';
    state.intro = null;
    if (!save.tutorial && !AUTOPLAY) {
      state.tut = { step: 0, t: 0 };
    } else {
      addCard('Fight!', state.general ? `${state.general.name} ${state.general.title}` : `${cap(state.difficulty)} skirmish`, 'fight');
    }
    Sound.boom(true);
  }

  function restart() {
    if (state.kind === 'campaign') startStage(state.stage, true);
    else start(state.difficulty);
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing') {
      state.mode = 'paused';
      ui.mode = null;
      showOverlay('paused');
    } else if (state.mode === 'paused' && overlay.querySelector('[data-act="resume"]')) {
      state.mode = 'playing';
      showOverlay(null);
    }
  }

  function toggleMute() {
    Sound.muted = !Sound.muted;
    save.muted = Sound.muted;
    storeSave();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    Sound.unlock();
    Sound.click();
    const act = b.dataset.act;
    if (b.dataset.start) start(b.dataset.start);
    else if (b.dataset.stage) {
      selectedStage = Number(b.dataset.stage);
      showOverlay('campaign');
    } else if (b.dataset.set) {
      const k = b.dataset.set;
      if (k === 'shake') save.shake = !save.shake;
      else if (k === 'effects') save.effects = save.effects === 'full' ? 'reduced' : 'full';
      else if (k === 'hints') save.hints = !save.hints;
      else if (k === 'sound') toggleMute();
      else if (k === 'tutorial') save.tutorial = !save.tutorial;
      storeSave();
      showOverlay('settings');
    } else if (act === 'campaign') {
      // Open on the stage just played, or the furthest unlocked one.
      if (state.kind === 'campaign') {
        selectedStage = Math.min(state.stage + (state.winner === 0 ? 1 : 0), GENERALS.length - 1);
      } else {
        let k = 0;
        while (k < GENERALS.length - 1 && save.stars[k] > 0) k++;
        selectedStage = k;
      }
      if (state.mode !== 'menu') newGame({ kind: 'demo' });
      showOverlay('campaign');
    } else if (act === 'skirmish') showOverlay('skirmish');
    else if (act === 'settings') {
      settingsBack = state.mode === 'paused' ? 'paused' : 'menu';
      showOverlay('settings');
    } else if (act === 'back') showOverlay(settingsBack);
    else if (act === 'tutorial') {
      save.tutorial = false;
      start('easy');
    } else if (act === 'fight') startStage(selectedStage);
    else if (act === 'next') startStage(state.stage + 1);
    else if (act === 'retry' || act === 'restart') restart();
    else if (act === 'resume') togglePause();
    else if (act === 'menu') showMenu();
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
    if (state && state.mode === 'intro') {
      if (hit && hit.kind === 'sys') activate(hit.item.id);
      else if (hit && hit.kind === 'skipintro') beginBattle();
      else advanceIntro();
      return;
    }
    if (!hit) {
      // Clicking empty space leaves placement mode.
      ui.mode = null;
      return;
    }
    if (hit.kind === 'slot') slotAction(hit.item.slot);
    else if (hit.kind === 'field') fireUlt();
    else if (hit.kind === 'skiptut') finishTutorial();
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
    if (k === 'm') { toggleMute(); return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (state && state.mode === 'intro') {
      if (k === ' ' || k === 'enter') { advanceIntro(); e.preventDefault(); }
      else if (k === 'escape') beginBattle();
      return;
    }
    if (k === 'escape' && ui.mode) { ui.mode = null; return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state || state.mode !== 'playing' || state.sides[0].ai) return;
    if ((ui.mode === 'build' || ui.mode === 'sell') && (k === '1' || k === '2' || k === '3')) slotAction(Number(k) - 1);
    else if (k === '1' || k === '2' || k === '3') activate(`unit${Number(k) - 1}`);
    else if (k === 't') activate('build');
    else if (k === 's') activate('sell');
    else if (k === 'u') activate('upgrade');
    else if (k === 'q') activate('special');
    else if (k === 'r') activate('ult');
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
    if (state) {
      Sound.quiet = state.mode === 'menu';
      if (state.mode === 'playing') {
        let left = real * SPEED;
        while (left > 0 && state.mode === 'playing') {
          const dt = Math.min(1 / 60, left);
          step(dt);
          left -= dt;
        }
      } else if (state.mode === 'menu') {
        step(real);
        if (state.t > 150) {
          newGame({ kind: 'demo' });
        }
      } else if (state.mode === 'ending') {
        step(real * 0.25); // slow motion for the final blow
        updateEnding(real);
      } else if (state.mode === 'intro') {
        state.intro.t += real;
        state.intro.chars += real * 50;
      }
      if (state.mode !== 'paused') updateEffects(state.mode === 'ending' ? real * 0.45 : real);
    }
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing (?autoplay pits the AI against itself;
  // add &stage=N to fight campaign general N).
  window.__nw = {
    get state() { return state; },
    ui,
    save,
    start,
    startStage,
    showMenu,
    tiles: () => hudTiles().map(({ id, x, y, w, h, enabled }) => ({ id, x, y, w, h, enabled })),
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
    // Fire a side's ultimate at x, charging it first.
    ultimate(i, x) {
      state.sides[i].ult = 1;
      return castUltimate(state.sides[i], x);
    },
    // Run the slow-motion ending to the results screen.
    finish() {
      while (state.mode === 'ending') {
        updateEnding(0.05);
        updateEffects(0.05);
      }
    },
  };

  if (AUTOPLAY) {
    if (params.has('stage')) startStage(Number(params.get('stage')) - 1, true);
    else start(params.get('difficulty') || 'normal');
  } else {
    showMenu();
  }
  requestAnimationFrame(frame);
})();
