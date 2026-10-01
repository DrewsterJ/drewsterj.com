'use strict';

// Nameless Survivor: walk a haunted moor while your weapons fire on their
// own. Collect soul gems to level up, combine weapons with the right passive
// to evolve them, and last fifteen minutes to face the Nameless. Everything is
// drawn on one canvas; there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const RUN_TIME = 15 * 60; // the final boss arrives at 15:00
  const EVO_REVEAL = 2.6; // seconds of the evolution reveal before the chest rewards
  const SLOWMO = 1.1; // real seconds of slow motion before an evolution
  const MAX_SLOTS = 6; // weapons and passives each
  const WEAPON_MAX = 8;
  const MAX_FOES = 420;
  const CELL = 64; // spatial grid for collisions
  const SAVE_KEY = 'nameless-survivor';

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');

  // Weapon stats: dmg, cd (seconds), amount, pierce, area, speed (projectile
  // speed multiplier), dur (seconds), knock. `ups` lists what each level from
  // 2 to 8 adds. `pair` is the passive that evolves it (at level 8, from a chest).
  const WEAPONS = {
    bolt: {
      name: 'Arcane Bolt', desc: 'Fires at the nearest enemy.', color: '#c084fc', pair: 'haste',
      base: { dmg: 12, cd: 1.0, amount: 1, pierce: 1, area: 1, speed: 1, knock: 4 },
      ups: [{ amount: 1 }, { cd: -0.2 }, { amount: 1 }, { dmg: 10 }, { amount: 1 }, { pierce: 1 }, { dmg: 10 }],
      evo: { name: 'Starfall Staff', desc: 'An endless stream of star bolts.', base: { dmg: 22, cd: 0.13, amount: 1, pierce: 2, area: 1.2, speed: 1.2, knock: 3 } },
    },
    scythe: {
      name: 'Scythe', desc: 'Sweeps sideways through enemies.', color: '#e2e8f0', pair: 'vigor',
      base: { dmg: 18, cd: 1.15, amount: 1, area: 1, knock: 10 },
      ups: [{ amount: 1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5 }],
      evo: { name: 'Soul Reaper', desc: 'Huge sweeps that heal you for each enemy cut.', base: { dmg: 60, cd: 1.1, amount: 2, area: 1.45, knock: 14 } },
    },
    orbit: {
      name: 'Moon Shards', desc: 'Shards circle you, bashing enemies away.', color: '#fde68a', pair: 'focus',
      base: { dmg: 12, cd: 3.2, amount: 1, area: 1, speed: 1, dur: 3, knock: 18 },
      ups: [{ amount: 1 }, { speed: 0.3, dmg: 5 }, { dur: 0.5, area: 0.25 }, { amount: 1 }, { speed: 0.3, dmg: 10 }, { dur: 0.5, area: 0.25 }, { amount: 1 }],
      evo: { name: 'Eclipse Ring', desc: 'Six shards that never stop turning.', base: { dmg: 30, cd: 0, amount: 6, area: 1.5, speed: 1.7, dur: 1, knock: 22 } },
    },
    aura: {
      name: 'Ward', desc: 'Harms and repels enemies close to you.', color: '#fbbf24', pair: 'renewal',
      base: { dmg: 8, cd: 0.55, area: 1, knock: 3 },
      ups: [{ area: 0.2, dmg: 2 }, { cd: -0.05, dmg: 1 }, { area: 0.2, dmg: 1 }, { cd: -0.05, dmg: 2 }, { area: 0.2, dmg: 1 }, { cd: -0.05, dmg: 1 }, { area: 0.2, dmg: 2 }],
      evo: { name: 'Sanctuary', desc: 'A wide holy ring that slows enemies and mends you.', base: { dmg: 20, cd: 0.4, area: 2.4, knock: 2 } },
    },
    daggers: {
      name: 'Daggers', desc: 'Thrown the way you are walking.', color: '#cbd5e1', pair: 'swift',
      base: { dmg: 8, cd: 0.9, amount: 1, pierce: 1, area: 1, speed: 1, knock: 3 },
      ups: [{ amount: 1 }, { amount: 1, dmg: 5 }, { amount: 1 }, { pierce: 1 }, { amount: 1 }, { amount: 1, dmg: 5 }, { pierce: 1 }],
      evo: { name: 'Thousand Edges', desc: 'A ceaseless torrent of blades.', base: { dmg: 16, cd: 0.045, amount: 1, pierce: 3, area: 1, speed: 1.2, knock: 2 } },
    },
    axe: {
      name: 'Cleaver', desc: 'Hurled high, it falls through the crowd.', color: '#94a3b8', pair: 'reach',
      base: { dmg: 22, cd: 1.5, amount: 1, pierce: 3, area: 1, speed: 1, knock: 6 },
      ups: [{ amount: 1 }, { dmg: 20 }, { pierce: 2, area: 0.1 }, { amount: 1 }, { dmg: 20 }, { pierce: 2, area: 0.1 }, { dmg: 20 }],
      evo: { name: "Headsman's Moon", desc: 'Giant cleavers that cut through everything.', base: { dmg: 70, cd: 1.1, amount: 4, pierce: 999, area: 1.7, speed: 1.1, knock: 10 } },
    },
    flask: {
      name: 'Firebomb', desc: 'Leaves pools of flame that burn enemies.', color: '#fb923c', pair: 'echo',
      base: { dmg: 8, cd: 3.2, amount: 1, area: 1, dur: 1.8, knock: 0 },
      ups: [{ amount: 1, area: 0.15 }, { dmg: 5, dur: 0.4 }, { amount: 1, area: 0.15 }, { dmg: 5, dur: 0.3 }, { amount: 1, area: 0.15 }, { dmg: 5, dur: 0.3 }, { dmg: 5, area: 0.15 }],
      evo: { name: 'Inferno', desc: 'Wide lakes of fire that creep toward enemies.', base: { dmg: 24, cd: 2.4, amount: 3, area: 1.9, dur: 4.5, knock: 0 } },
    },
    strike: {
      name: 'Sky Strike', desc: 'Lightning hits random enemies.', color: '#7dd3fc', pair: 'magnet',
      base: { dmg: 25, cd: 2.5, amount: 3, area: 1, knock: 0 },
      ups: [{ amount: 1 }, { area: 0.4, dmg: 10 }, { amount: 1 }, { cd: -0.4, dmg: 10 }, { amount: 1 }, { area: 0.4, dmg: 10 }, { amount: 1 }],
      evo: { name: 'Thunder Crown', desc: 'Strikes chain between nearby enemies.', base: { dmg: 50, cd: 2, amount: 6, area: 1.8, knock: 0 } },
    },
    glaive: {
      name: 'Moonglaive', desc: 'Thrown at an enemy, then it flies back to you.', color: '#a5f3fc', pair: 'might',
      base: { dmg: 15, cd: 1.7, amount: 1, pierce: 999, area: 1, speed: 1, knock: 6 },
      ups: [{ dmg: 6 }, { amount: 1 }, { area: 0.15, dmg: 4 }, { cd: -0.3 }, { amount: 1 }, { dmg: 8, area: 0.15 }, { amount: 1 }],
      evo: { name: 'Crescent Tempest', desc: 'A ring of glaives that sweeps out and back.', base: { dmg: 38, cd: 1.2, amount: 6, pierce: 999, area: 1.45, speed: 1.15, knock: 8 } },
    },
    spikes: {
      name: 'Grave Spikes', desc: 'Bone spikes burst up in a line toward enemies.', color: '#e7e5e4', pair: 'plating',
      base: { dmg: 20, cd: 2.2, amount: 1, area: 1, knock: 7 },
      ups: [{ dmg: 8 }, { amount: 1 }, { area: 0.15 }, { dmg: 10 }, { amount: 1 }, { cd: -0.4 }, { dmg: 12, area: 0.15 }],
      evo: { name: 'Ossuary', desc: 'Spikes burst out in every direction at once.', base: { dmg: 46, cd: 1.5, amount: 8, area: 1.35, knock: 9 } },
    },
  };

  // Passive fields: max level and what each level adds to the stats.
  const PASSIVES = {
    might: { name: 'Might', desc: '+10% damage.', max: 5, apply: (s, l) => { s.might += 0.1 * l; } },
    haste: { name: 'Haste', desc: '8% faster weapon cooldowns.', max: 5, apply: (s, l) => { s.cooldown *= 1 - 0.08 * l; } },
    reach: { name: 'Reach', desc: '+10% weapon area.', max: 5, apply: (s, l) => { s.area += 0.1 * l; } },
    focus: { name: 'Focus', desc: '+10% effect duration and projectile speed.', max: 5, apply: (s, l) => { s.duration += 0.1 * l; s.projSpeed += 0.1 * l; } },
    swift: { name: 'Swiftness', desc: '+10% move speed.', max: 5, apply: (s, l) => { s.speed *= 1 + 0.1 * l; } },
    vigor: { name: 'Vigor', desc: '+20% max health.', max: 5, apply: (s, l) => { s.maxHp *= 1 + 0.2 * l; } },
    renewal: { name: 'Renewal', desc: 'Recover 0.25 health per second.', max: 5, apply: (s, l) => { s.regen += 0.25 * l; } },
    magnet: { name: 'Lodestone', desc: '+40% pickup range.', max: 5, apply: (s, l) => { s.magnet *= 1 + 0.4 * l; } },
    echo: { name: 'Echo', desc: 'Weapons fire one more projectile.', max: 2, apply: (s, l) => { s.amount += l; } },
    plating: { name: 'Plating', desc: 'Take 1 less damage from each hit.', max: 5, apply: (s, l) => { s.armor += l; } },
  };

  // Characters. `stats` multiply or add to the base stats.
  const CHARS = {
    wanderer: { name: 'The Wanderer', weapon: 'bolt', cost: 0, cloak: '#4c1d95', trim: '#a78bfa', perk: 'Balanced. Starts with Arcane Bolt.', stats: {} },
    reaper: { name: 'The Reaper', weapon: 'scythe', cost: 400, cloak: '#1f2937', trim: '#e2e8f0', perk: '+20% damage, +10% area. Starts with Scythe.', stats: { might: 0.2, area: 0.1 } },
    warden: { name: 'The Warden', weapon: 'aura', cost: 700, cloak: '#78350f', trim: '#fbbf24', perk: '+30% health, 2 armor, a little slower. Starts with Ward.', stats: { maxHp: 1.3, armor: 2, speed: 0.95 } },
    pyre: { name: 'The Pyre', weapon: 'flask', cost: 1000, cloak: '#7c2d12', trim: '#fb923c', perk: '+10% area. Starts with Firebomb.', stats: { area: 0.1 } },
    storm: { name: 'The Stormcaller', weapon: 'strike', cost: 1400, cloak: '#0c4a6e', trim: '#7dd3fc', perk: '+10% speed, 10% faster cooldowns. Starts with Sky Strike.', stats: { speed: 1.1, cooldown: 0.9 } },
  };

  // Permanent upgrades bought with gold between runs. Cost of rank r is cost * (r + 1).
  const SHOP = {
    might: { name: 'Might', desc: '+5% damage', max: 5, cost: 150 },
    vigor: { name: 'Vigor', desc: '+10% max health', max: 3, cost: 150 },
    plating: { name: 'Plating', desc: '+1 armor', max: 2, cost: 300 },
    renewal: { name: 'Renewal', desc: '+0.1 health per second', max: 3, cost: 200 },
    haste: { name: 'Haste', desc: '3% faster cooldowns', max: 3, cost: 250 },
    reach: { name: 'Reach', desc: '+5% area', max: 2, cost: 200 },
    swift: { name: 'Swiftness', desc: '+5% move speed', max: 2, cost: 150 },
    magnet: { name: 'Lodestone', desc: '+20% pickup range', max: 2, cost: 100 },
    growth: { name: 'Growth', desc: '+4% experience', max: 5, cost: 250 },
    greed: { name: 'Greed', desc: '+15% gold', max: 5, cost: 120 },
    reroll: { name: 'Reroll', desc: '+1 level-up reroll per run', max: 3, cost: 300 },
    revival: { name: 'Revival', desc: 'Get back up once per run', max: 1, cost: 1500 },
  };

  // Enemy fields: hp, speed, dmg (on touch), r, xp, and optional behaviour.
  const FOES = {
    wisp: { name: 'Wisp', hp: 5, speed: 92, dmg: 5, r: 9, xp: 1, fly: true },
    husk: { name: 'Husk', hp: 10, speed: 50, dmg: 7, r: 11, xp: 1 },
    moth: { name: 'Moth', hp: 4, speed: 170, dmg: 5, r: 8, xp: 1, fly: true, straight: true },
    blob: { name: 'Blob', hp: 26, speed: 38, dmg: 8, r: 14, xp: 2, split: 'blobling' },
    blobling: { name: 'Blobling', hp: 8, speed: 62, dmg: 5, r: 8, xp: 1 },
    shade: { name: 'Shade', hp: 20, speed: 74, dmg: 9, r: 12, xp: 2, ghost: true },
    hexer: { name: 'Hexer', hp: 32, speed: 55, dmg: 8, r: 12, xp: 3, ranged: true },
    brute: { name: 'Brute', hp: 90, speed: 43, dmg: 14, r: 18, xp: 5, heavy: 0.5 },
    knight: { name: 'Dread Knight', hp: 220, speed: 47, dmg: 16, r: 16, xp: 8, heavy: 0.85 },
    wraith: { name: 'Wraith', hp: 150, speed: 90, dmg: 15, r: 14, xp: 8, ghost: true },
    spiderling: { name: 'Spiderling', hp: 16, speed: 120, dmg: 6, r: 8, xp: 1 },
    // Frozen Fen.
    frostling: { name: 'Frost Imp', hp: 10, speed: 66, dmg: 5, r: 9, xp: 1, chill: true },
    golem: { name: 'Rime Golem', hp: 100, speed: 38, dmg: 13, r: 18, xp: 5, heavy: 0.6, shatter: true },
    // Ashen Ruins.
    cinder: { name: 'Cinderling', hp: 8, speed: 112, dmg: 9, r: 9, xp: 1, fly: true, explode: true },
    revenant: { name: 'Ash Revenant', hp: 140, speed: 46, dmg: 12, r: 15, xp: 6, heavy: 0.6, dash: true },
    colossus: { name: 'Bone Colossus', hp: 3200, speed: 46, dmg: 20, r: 40, xp: 0, boss: true, heavy: 1 },
    widow: { name: 'The Widow', hp: 11000, speed: 58, dmg: 26, r: 42, xp: 0, boss: true, heavy: 1 },
    rimequeen: { name: 'The Rime Queen', hp: 11500, speed: 56, dmg: 26, r: 40, xp: 0, boss: true, heavy: 1 },
    tyrant: { name: 'The Ember Tyrant', hp: 12000, speed: 54, dmg: 28, r: 44, xp: 0, boss: true, heavy: 1 },
    nameless: { name: 'The Nameless', hp: 60000, speed: 62, dmg: 34, r: 50, xp: 0, boss: true, heavy: 1, final: true },
    brazier: { name: 'Brazier', hp: 1, speed: 0, dmg: 0, r: 13, xp: 0, prop: true },
  };

  // One entry per minute: how many enemies to keep around and who they are.
  const WAVES = [
    { quota: 14, mix: { husk: 6, wisp: 3 } },
    { quota: 28, mix: { husk: 5, wisp: 4 } },
    { quota: 40, mix: { husk: 4, blob: 2, wisp: 2 } },
    { quota: 52, mix: { husk: 3, blob: 2, shade: 3 } },
    { quota: 62, mix: { shade: 4, husk: 2, hexer: 1 } },
    { quota: 72, mix: { brute: 1, shade: 3, husk: 3 } },
    { quota: 92, mix: { husk: 3, brute: 2, hexer: 1, blob: 2 } },
    { quota: 110, mix: { shade: 3, brute: 2, wisp: 3, hexer: 1 } },
    { quota: 130, mix: { knight: 1, brute: 2, husk: 4 } },
    { quota: 150, mix: { knight: 2, hexer: 2, shade: 3 } },
    { quota: 160, mix: { wraith: 2, brute: 2, husk: 3 } },
    { quota: 180, mix: { wraith: 3, knight: 2, hexer: 1 } },
    { quota: 200, mix: { knight: 3, wraith: 3, blob: 2 } },
    { quota: 230, mix: { wraith: 3, knight: 3, brute: 2 } },
    { quota: 260, mix: { wraith: 4, knight: 3, hexer: 2 } },
    { quota: 90, mix: { wraith: 3, shade: 3 } }, // during the final fight
  ];

  // Timed events, in seconds.
  const EVENTS = [
    { t: 90, kind: 'moths', n: 26 },
    { t: 120, kind: 'elite', type: 'husk' },
    { t: 180, kind: 'ring', type: 'husk', n: 36 },
    { t: 240, kind: 'moths', n: 34 },
    { t: 270, kind: 'elite', type: 'shade' },
    { t: 300, kind: 'boss', type: 'colossus' },
    { t: 390, kind: 'elite', type: 'blob' },
    { t: 450, kind: 'moths', n: 44 },
    { t: 480, kind: 'ring', type: 'shade', n: 48 },
    { t: 510, kind: 'elite', type: 'brute' },
    { t: 570, kind: 'elite', type: 'hexer' },
    { t: 600, kind: 'boss', type: 'widow' },
    { t: 660, kind: 'elite', type: 'knight' },
    { t: 720, kind: 'moths', n: 60 },
    { t: 750, kind: 'elite', type: 'wraith' },
    { t: 780, kind: 'ring', type: 'wraith', n: 44 },
    { t: 810, kind: 'elite', type: 'knight' },
    { t: 870, kind: 'elite', type: 'brute' },
    { t: RUN_TIME, kind: 'boss', type: 'nameless' },
  ];

  // Maps. `swap` replaces some moor enemies with local ones ([type, chance]),
  // `boss` replaces the 10:00 boss, and `unlock` names the map to survive
  // ten minutes on first.
  const MAPS = {
    moor: {
      name: 'Haunted Moor', desc: 'Where every wanderer begins.', boss: 'widow', hp: 1,
      ground: { base: '#1b2724', light: 'rgba(40,62,54,0.55)', dark: 'rgba(14,22,20,0.45)', grass: ['#2c4a3d', '#355a48'], stone: '#35403f', motes: ['#e9d5ff', '#fde68a', '#a5f3fc'] },
      fog: [3, 6, 14], weather: 'fireflies', swap: {},
    },
    fen: {
      name: 'Frozen Fen', desc: 'Frost imps, rime golems and the Rime Queen.', boss: 'rimequeen', hp: 1, unlock: 'moor',
      ground: { base: '#1c2933', light: 'rgba(120,160,190,0.22)', dark: 'rgba(8,16,26,0.45)', grass: ['#5b7385', '#7b95a6'], stone: '#3b4a55', motes: ['#e0f2fe', '#bae6fd', '#f0f9ff'], snow: true },
      fog: [6, 14, 26], weather: 'snow', swap: { husk: ['frostling', 0.4], wisp: ['frostling', 0.3], brute: ['golem', 0.5], blob: ['golem', 0.2] },
    },
    ruins: {
      name: 'Ashen Ruins', desc: 'Cinderlings, ash revenants and the Ember Tyrant.', boss: 'tyrant', hp: 1.05, unlock: 'fen',
      ground: { base: '#211917', light: 'rgba(80,50,38,0.45)', dark: 'rgba(8,4,3,0.5)', grass: ['#4a3f3a', '#5c4c44'], stone: '#3a2f2b', motes: ['#fdba74', '#fca5a5', '#fde68a'], cracks: true },
      fog: [18, 6, 4], weather: 'embers', swap: { wisp: ['cinder', 0.55], shade: ['cinder', 0.3], knight: ['revenant', 0.4], brute: ['revenant', 0.3] },
    },
  };
  const MAP_ORDER = ['moor', 'fen', 'ruins'];

  // The Curse: more, faster and tougher enemies for more gold.
  const CURSE = { quota: 1.35, speed: 1.1, hp: 1.2, gold: 1.5 };

  const DMG_COLORS = ['#ffffff', '#fef08a', '#fdba74', '#fb7185'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  function weighted(entries) {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = Math.random() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  function formatTime(t) {
    t = Math.max(0, Math.floor(t));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  // Newer fields (maps, curse, settings, tutorial) are optional so older saves
  // load unchanged.
  const DEFAULT_SAVE = { gold: 0, shop: {}, chars: { wanderer: true }, char: 'wanderer', best: null, runs: 0, maps: { moor: true }, map: 'moor', curse: false, veteran: false, settings: {}, tut: false };

  function freshSave() {
    return { ...DEFAULT_SAVE, shop: {}, chars: { wanderer: true }, maps: { moor: true }, settings: {} };
  }

  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        const out = {
          ...DEFAULT_SAVE,
          ...s,
          shop: { ...(s.shop || {}) },
          chars: { wanderer: true, ...(s.chars || {}) },
          maps: { moor: true, ...(s.maps || {}) },
          settings: { ...(s.settings || {}) },
        };
        // Players who already lasted ten minutes before maps existed keep that.
        if (out.best && (out.best.won || out.best.time >= 600)) {
          out.maps.fen = true;
          out.veteran = true;
        }
        if (!MAPS[out.map] || !out.maps[out.map]) out.map = 'moor';
        if (s.tut === undefined && out.runs > 0) out.tut = true; // returning players skip the tutorial
        return out;
      }
    } catch {
      // Fall through to a fresh save.
    }
    return freshSave();
  }

  let save = loadSave();

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Storage can be unavailable (private mode); progress is just not kept.
    }
  }

  // Player settings. Screen shake starts off for people who ask for less motion.
  const reducedMotion = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();

  function setting(k) {
    const v = save.settings && save.settings[k];
    if (v !== undefined) return v;
    return k === 'shake' ? !reducedMotion : true;
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

    shoot() { this.play('shoot', 0.07, () => this.tone(760, 0.07, 'triangle', 0.025, 420)); },
    swish() { this.play('swish', 0.08, () => this.noise(0.14, 0.07, 2600)); },
    zap() { this.play('zap', 0.08, () => { this.noise(0.18, 0.1, 6000); this.tone(1400, 0.12, 'sawtooth', 0.025, 200); }); },
    burn() { this.play('burn', 0.2, () => this.noise(0.3, 0.06, 900)); },
    hit() { this.play('hit', 0.045, () => this.noise(0.04, 0.05, 2500)); },
    die() { this.play('die', 0.05, () => this.tone(300, 0.08, 'square', 0.02, 120)); },
    gem() { this.play('gem', 0.035, () => this.tone(1100 + Math.random() * 300, 0.05, 'sine', 0.03)); },
    coin() { this.play('coin', 0.06, () => { this.tone(1320, 0.06, 'square', 0.025); this.tone(1760, 0.08, 'square', 0.02, null, 0.05); }); },
    heal() { this.play('heal', 0.2, () => [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'sine', 0.05, null, i * 0.05))); },
    hurt() { this.play('hurt', 0.18, () => this.tone(200, 0.2, 'sawtooth', 0.05, 90)); },
    boom() { this.play('boom', 0.1, () => { this.noise(0.5, 0.25, 500); this.tone(90, 0.4, 'sine', 0.2, 35); }); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    levelup() {
      this.play('levelup', 0.3, () => [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.07, null, i * 0.06)));
    },
    chest() {
      this.play('chest', 0.5, () => [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.07, null, i * 0.09)));
    },
    boss() {
      this.play('boss', 1, () => [110, 104, 98].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.08, null, i * 0.35)));
    },
    win() {
      this.play('end', 1, () => [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, null, i * 0.13)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
    heart() {
      this.play('heart', 0.4, () => {
        this.tone(70, 0.12, 'sine', 0.22, 45);
        this.tone(64, 0.14, 'sine', 0.16, 40, 0.16);
      });
    },
    tick() { this.play('tick', 0.055, () => this.tone(1500 + Math.random() * 500, 0.03, 'square', 0.018)); },
    ding() { this.play('ding', 0.08, () => { this.tone(1568, 0.25, 'triangle', 0.06); this.tone(2093, 0.3, 'sine', 0.035, null, 0.04); }); },
    whoosh() { this.play('whoosh', 0.5, () => { this.noise(0.9, 0.12, 700); this.tone(220, 0.9, 'sine', 0.06, 55); }); },
    evolve() {
      this.play('evolve', 1, () => {
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.07, null, i * 0.07));
        [523, 659, 784].forEach((f) => this.tone(f, 1.4, 'sawtooth', 0.025, null, 0.55));
        this.tone(1047, 1.5, 'sine', 0.06, null, 0.55);
        this.noise(1.2, 0.05, 9000);
      });
    },
    pop() { this.play('pop', 0.06, () => { this.noise(0.12, 0.12, 1800); this.tone(180, 0.14, 'square', 0.03, 60); }); },
    slam() { this.play('slam', 0.15, () => { this.noise(0.6, 0.3, 380); this.tone(70, 0.6, 'sine', 0.25, 30); }); },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  let simulating = false; // true while simulate() plays a run with the bot
  const input = { keys: new Set(), mx: W / 2, my: H / 2, over: false, stick: null };
  let nextId = 1;

  function xpFor(level) {
    if (level < 20) return 5 + (level - 1) * 8;
    if (level < 40) return 160 + (level - 20) * 14;
    return 440 + (level - 40) * 20;
  }

  function newGame(charId = save.char, mapId = save.map, curse = save.curse) {
    if (!CHARS[charId] || !save.chars[charId]) charId = 'wanderer';
    if (!MAPS[mapId] || !save.maps[mapId]) mapId = 'moor';
    state = {
      mode: 'playing',
      char: charId,
      map: mapId,
      curse: !!curse,
      t: 0,
      p: { x: 0, y: 0, r: 12, hp: 1, maxHp: 0, face: { x: 1, y: 0 }, faceX: 1, walk: 0, moving: false, hurtT: 0, iframe: 0, chill: 0 },
      st: null,
      weapons: [],
      passives: [],
      foes: [],
      shots: [],
      eshots: [],
      pools: [],
      hazards: [], // telegraphed ground attacks from bosses
      gems: [],
      pickups: [],
      fx: [],
      parts: [],
      texts: [],
      level: 1,
      xp: 0,
      xpNeed: xpFor(1),
      pending: 0,
      choices: null,
      chest: null,
      kills: 0,
      gold: 0,
      rerolls: save.shop.reroll || 0,
      revived: false,
      spawnT: 0.5,
      brazierT: 6,
      ev: 0,
      final: false,
      won: false,
      endT: 0,
      bossId: 0,
      banner: null,
      shake: 0,
      hitstop: 0, // real seconds the world freezes for after a big kill
      cine: null, // boss intro: the camera pans to the boss
      slowmo: null, // the moment before an evolution
      lvlFlash: 0,
      xpPulse: 0,
      heartT: 0,
      moved: 0,
      tut: !save.tut && !simulating && !AUTOPLAY ? { step: 0, t: 0 } : null,
      dmgBy: {},
      hurtBy: {},
    };
    computeStats();
    state.p.hp = state.st.maxHp;
    addWeapon(CHARS[charId].weapon);
  }

  function computeStats() {
    const s = baseStats(state.passives);
    const p = state.p;
    if (p.maxHp) p.hp = Math.min(s.maxHp, p.hp + Math.max(0, s.maxHp - p.maxHp));
    p.maxHp = s.maxHp;
    state.st = s;
    for (const w of state.weapons) w.s = weaponStats(w);
  }

  // Character, shop and passive stats (used for upgrade card previews too).
  function baseStats(passives) {
    const c = CHARS[state.char].stats;
    const sh = save.shop;
    const s = {
      might: 1 + (c.might || 0) + 0.05 * (sh.might || 0),
      cooldown: (c.cooldown || 1) * (1 - 0.03 * (sh.haste || 0)),
      area: 1 + (c.area || 0) + 0.05 * (sh.reach || 0),
      duration: 1,
      projSpeed: 1,
      speed: 150 * (c.speed || 1) * (1 + 0.05 * (sh.swift || 0)),
      maxHp: 120 * (c.maxHp || 1) * (1 + 0.1 * (sh.vigor || 0)),
      regen: 0.1 + 0.1 * (sh.renewal || 0),
      magnet: 50 * (1 + 0.2 * (sh.magnet || 0)),
      amount: 0,
      armor: (c.armor || 0) + (sh.plating || 0),
      growth: 1 + 0.04 * (sh.growth || 0),
      greed: (1 + 0.15 * (sh.greed || 0)) * (state.curse ? CURSE.gold : 1),
    };
    for (const ps of passives) PASSIVES[ps.id].apply(s, ps.level);
    return s;
  }

  function weaponStats(w, st = state.st) {
    const def = WEAPONS[w.id];
    const s = { ...(w.evolved ? def.evo.base : def.base) };
    if (!w.evolved) {
      for (let i = 0; i < w.level - 1; i++) {
        for (const [k, v] of Object.entries(def.ups[i])) s[k] = (s[k] || 0) + v;
      }
    }
    return {
      dmg: s.dmg * st.might,
      cd: s.cd * st.cooldown,
      amount: (s.amount || 1) + st.amount,
      pierce: s.pierce || 1,
      area: (s.area || 1) * st.area,
      speed: (s.speed || 1) * st.projSpeed,
      dur: (s.dur || 0) * st.duration,
      knock: s.knock || 0,
    };
  }

  function addWeapon(id) {
    const w = { id, level: 1, evolved: false, t: 0.4, queue: 0, qt: 0, phase: 0, active: 0, targets: [] };
    state.weapons.push(w);
    w.s = weaponStats(w);
    state.dmgBy[id] = state.dmgBy[id] || 0;
  }

  const hasPassive = (id) => state.passives.some((ps) => ps.id === id);
  const canEvolve = (w) => !w.evolved && w.level >= WEAPON_MAX && hasPassive(WEAPONS[w.id].pair);

  // ---------------------------------------------------------------------------
  // Spatial grid
  // ---------------------------------------------------------------------------

  const grid = new Map();
  const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

  function buildGrid() {
    if (grid.size > 3000) grid.clear();
    for (const a of grid.values()) a.length = 0;
    for (const e of state.foes) {
      if (e.dead) continue;
      const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(e);
    }
  }

  // Calls fn(e) for each living foe whose body overlaps the circle (x, y, r).
  function query(x, y, r, fn) {
    const pad = r + 52;
    const x0 = Math.floor((x - pad) / CELL);
    const x1 = Math.floor((x + pad) / CELL);
    const y0 = Math.floor((y - pad) / CELL);
    const y1 = Math.floor((y + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = grid.get(gkey(cx, cy));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          if (e.dead) continue;
          const rr = r + e.r;
          if (dist2(x, y, e.x, e.y) <= rr * rr && fn(e) === false) return;
        }
      }
    }
  }

  function nearestFoes(x, y, n, maxD = 640) {
    const out = [];
    const md = maxD * maxD;
    for (const e of state.foes) {
      if (e.dead || e.prop) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d > md) continue;
      out.push([d, e]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n).map((o) => o[1]);
  }

  const onScreen = (e, margin = 0) =>
    Math.abs(e.x - state.p.x) < W / 2 + margin && Math.abs(e.y - state.p.y) < H / 2 + margin;

  // ---------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------

  function spawnPoint(margin = 60) {
    const p = state.p;
    const hw = W / 2 + margin;
    const hh = H / 2 + margin;
    // A random point on the edge of a box just outside the view.
    const per = 2 * (hw + hh);
    let r = Math.random() * per * 2;
    if (r < hw * 2) return { x: p.x - hw + r, y: p.y - hh };
    r -= hw * 2;
    if (r < hh * 2) return { x: p.x + hw, y: p.y - hh + r };
    r -= hh * 2;
    if (r < hw * 2) return { x: p.x + hw - r, y: p.y + hh };
    r -= hw * 2;
    return { x: p.x - hw, y: p.y + hh - r };
  }

  function spawnFoe(type, x, y, opts = {}) {
    const def = FOES[type];
    if (x === undefined) ({ x, y } = spawnPoint());
    // Enemies get tougher as the run goes on, faster toward the end.
    const m = state.t / 60;
    const curse = state.curse && !def.prop;
    let scale = def.boss || def.prop ? 1 : (1 + 0.08 * m + 0.015 * m * m) * MAPS[state.map].hp;
    if (curse) scale *= CURSE.hp;
    const elite = !!opts.elite;
    const e = {
      id: nextId++,
      type,
      x,
      y,
      r: def.r * (elite ? 1.6 : 1),
      hp: def.hp * scale * (elite ? 14 : 1),
      speed: def.speed * (elite ? 1.08 : 1) * rand(0.92, 1.08) * (curse && !def.boss ? CURSE.speed : 1),
      dmg: def.dmg * (elite ? 1.4 : 1) * (def.boss ? 1 : 1 + 0.05 * m),
      xp: def.xp * (elite ? 12 : 1),
      elite,
      boss: !!def.boss,
      prop: !!def.prop,
      ghost: !!def.ghost,
      dashes: !!def.dash,
      heavy: elite ? 0.9 : def.heavy || 0,
      kx: 0,
      ky: 0,
      flash: -1,
      touchCd: 0,
      orbCd: 0,
      slow: 0,
      faceX: 1,
      bob: Math.random() * 6,
      ai: rand(1, 3),
      ai2: rand(2, 5),
      vx: 0,
      vy: 0,
      life: 0,
      dead: false,
    };
    e.maxHp = e.hp;
    state.foes.push(e);
    if (e.boss) {
      state.bossId = e.id;
      const sub = def.final ? 'Destroy it to win' : 'A boss approaches';
      if (simulating || (AUTOPLAY && SPEED > 2)) state.banner = { text: def.name, sub, t: 3 };
      // Boss intro: freeze the world and pan the camera over to it.
      else state.cine = { id: e.id, x: e.x, y: e.y, t: 0, dur: 2.7, name: def.name, sub };
      Sound.boss();
    }
    return e;
  }

  // Some moor enemies are replaced by local ones on other maps.
  function localType(type) {
    const sw = MAPS[state.map].swap[type];
    return sw && Math.random() < sw[1] ? sw[0] : type;
  }

  function runEvent(ev) {
    const p = state.p;
    if (ev.kind === 'moths') {
      // A flock sweeps across the screen in a straight line.
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const sx = p.x - dx * 620;
      const sy = p.y - dy * 620;
      for (let i = 0; i < ev.n; i++) {
        const off = (i - ev.n / 2) * 16 + rand(-6, 6);
        const e = spawnFoe('moth', sx - dy * off + rand(-60, 0) * dx, sy + dx * off + rand(-60, 0) * dy);
        e.vx = dx * FOES.moth.speed;
        e.vy = dy * FOES.moth.speed;
        e.life = 9;
        e.faceX = dx >= 0 ? 1 : -1;
      }
    } else if (ev.kind === 'ring') {
      for (let i = 0; i < ev.n; i++) {
        const a = (i / ev.n) * Math.PI * 2;
        spawnFoe(localType(ev.type), p.x + Math.cos(a) * 480, p.y + Math.sin(a) * 340);
      }
      state.banner = { text: 'Surrounded!', sub: '', t: 1.8 };
    } else if (ev.kind === 'elite') {
      spawnFoe(localType(ev.type), undefined, undefined, { elite: true });
    } else if (ev.kind === 'boss') {
      if (ev.type === 'nameless') state.final = true;
      const pt = spawnPoint(80);
      spawnFoe(ev.type === 'widow' ? MAPS[state.map].boss : ev.type, pt.x, pt.y);
    }
  }

  function director(dt) {
    const minute = state.final ? 15 : Math.min(14, Math.floor(state.t / 60));
    const wave = WAVES[minute];
    state.spawnT -= dt;
    if (state.spawnT <= 0) {
      state.spawnT += 1;
      let alive = 0;
      for (const e of state.foes) if (!e.prop && !e.boss && !e.dead && e.life === 0) alive++;
      const trickle = Math.round(1 + minute * 0.45);
      const quota = Math.round(wave.quota * (state.curse ? CURSE.quota : 1));
      const n = Math.min(Math.max(quota - alive, trickle), MAX_FOES - state.foes.length, 36);
      const mix = Object.entries(wave.mix);
      for (let i = 0; i < n; i++) spawnFoe(localType(weighted(mix)));
    }
    while (state.ev < EVENTS.length && state.t >= EVENTS[state.ev].t) runEvent(EVENTS[state.ev++]);

    state.brazierT -= dt;
    if (state.brazierT <= 0) {
      state.brazierT = 10;
      let n = 0;
      for (const e of state.foes) if (e.prop) n++;
      if (n < 6) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(560, 760);
        spawnFoe('brazier', state.p.x + Math.cos(a) * d, state.p.y + Math.sin(a) * d);
      }
    }
  }

  function updateFoes(dt) {
    const p = state.p;
    const decay = Math.exp(-9 * dt);
    for (const e of state.foes) {
      if (e.dead) continue;
      e.flash -= dt;
      e.touchCd -= dt;
      e.orbCd -= dt;
      e.slow -= dt;
      e.bob += dt * 6;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      if (e.prop) {
        if (d > 1500) e.dead = true;
        continue;
      }

      if (e.life > 0) {
        // Moths fly straight and leave.
        e.life -= dt;
        e.x += e.vx * dt + e.kx * dt;
        e.y += e.vy * dt + e.ky * dt;
        if (e.life <= 0) e.dead = true;
      } else {
        let spd = e.speed * (e.slow > 0 ? 0.55 : 1);
        let mx = dx / d;
        let my = dy / d;
        if (e.type === 'hexer') hexer(e, d, dt);
        if (e.type === 'hexer' && d < 230) {
          mx = -mx * 0.6;
          my = -my * 0.6;
        }
        if (e.boss || e.dashes) {
          const r = e.boss ? bossAi(e, d, dx, dy, dt) : dasher(e, d, dx, dy, dt);
          if (r) ({ mx, my, spd } = r);
        }
        e.x += (mx * spd + e.kx) * dt;
        e.y += (my * spd + e.ky) * dt;
        if (Math.abs(mx) > 0.05) e.faceX = mx > 0 ? 1 : -1;
        // Enemies left far behind are moved back into play ahead of you.
        if (d > 1150 && !e.boss) {
          const pt = spawnPoint();
          e.x = pt.x;
          e.y = pt.y;
        }
      }
      e.kx *= decay;
      e.ky *= decay;

      if (d < e.r + p.r - 2 && e.touchCd <= 0) {
        e.touchCd = 0.6;
        hurtPlayer(e.dmg, e.type);
        const def = FOES[e.type];
        if (def.chill) p.chill = 1.2;
        if (def.explode) {
          // Cinderlings burst on contact and are gone.
          e.dead = true;
          burst(e.x, e.y, '#fb923c', 14, 180);
          state.fx.push({ kind: 'pop', x: e.x, y: e.y, r: 34, color: '#fdba74', t: 0, life: 0.3 });
          Sound.pop();
        }
      }
    }

    // Push overlapping enemies apart so they form a crowd, not a single blob.
    for (const e of state.foes) {
      if (e.dead || e.prop || e.ghost || e.life > 0) continue;
      query(e.x, e.y, e.r, (o) => {
        if (o === e || o.ghost || o.prop || o.life > 0) return;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = e.r + o.r - d;
        if (overlap <= 0) return;
        const we = e.boss ? 0.05 : 0.5;
        e.x += (dx / d) * overlap * we * 0.5;
        e.y += (dy / d) * overlap * we * 0.5;
      });
    }
  }

  function hexer(e, d, dt) {
    e.ai -= dt;
    if (e.ai <= 0 && d < 520) {
      e.ai = e.elite ? 1.4 : 3;
      const p = state.p;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const shots = e.elite ? 5 : 1;
      for (let k = 0; k < shots; k++) enemyShot(e.x, e.y, a + (k - (shots - 1) / 2) * 0.22, 150, e.dmg);
    }
  }

  function enemyShot(x, y, a, spd, dmg, color = '#f472b6') {
    state.eshots.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg, life: 6, color });
  }

  // A telegraphed ground attack: a warning circle, then a hit after `delay`.
  function hazard(x, y, r, delay, dmg, kind) {
    state.hazards.push({ x, y, r, t: 0, delay, dmg, kind, done: false });
  }

  function updateHazards(dt) {
    const p = state.p;
    const hz = state.hazards;
    for (let i = hz.length - 1; i >= 0; i--) {
      const h = hz[i];
      h.t += dt;
      if (!h.done && h.t >= h.delay) {
        h.done = true;
        if (dist2(h.x, h.y, p.x, p.y) < (h.r + p.r * 0.5) ** 2) hurtPlayer(h.dmg, h.kind === 'ice' ? 'icicle' : 'eruption');
        burst(h.x, h.y, h.kind === 'ice' ? '#bae6fd' : '#fb923c', 8, 160);
        shake(2);
        Sound.pop();
      }
      if (h.t > h.delay + 0.4) hz.splice(i, 1);
    }
  }

  // Ash revenants (and the Colossus) wind up, then lunge in a straight line.
  function dasher(e, d, dx, dy, dt, speed = 260, time = 0.5) {
    if (e.charge > 0) {
      e.charge -= dt;
      return { mx: e.cx, my: e.cy, spd: speed };
    }
    if (e.wind > 0) {
      e.wind -= dt;
      if (e.wind <= 0) {
        e.charge = time;
        e.cx = dx / d;
        e.cy = dy / d;
      }
      return { mx: 0, my: 0, spd: 0 };
    }
    if (!e.boss) {
      e.ai -= dt;
      if (e.ai <= 0 && d < 360) {
        e.ai = rand(3.5, 5);
        e.wind = 0.7;
      }
    }
    return null;
  }

  function bossAi(e, d, dx, dy, dt) {
    e.ai -= dt;
    e.ai2 -= dt;
    const p = state.p;
    const enraged = e.hp < e.maxHp * 0.5;
    if (e.type === 'colossus') {
      // Winds up, then charges in a straight line.
      if (e.charge > 0 || e.wind > 0) {
        const was = e.wind;
        const r = dasher(e, d, dx, dy, dt, 330, 0.85);
        if (was > 0 && e.wind <= 0) shake(6);
        return r;
      }
      if (e.ai <= 0) {
        e.ai = enraged ? 3 : 4.5;
        e.wind = 0.7;
      }
      if (e.ai2 <= 0) {
        e.ai2 = 5;
        for (let k = 0; k < 10; k++) enemyShot(e.x, e.y, (k / 10) * Math.PI * 2, 130, 12);
      }
    } else if (e.type === 'widow') {
      if (e.ai <= 0) {
        e.ai = enraged ? 2.5 : 3.5;
        for (let k = 0; k < 5; k++) {
          const s = spawnFoe('spiderling', e.x + rand(-30, 30), e.y + rand(-30, 30));
          s.hp *= 1 + state.t / 400;
        }
      }
      if (e.ai2 <= 0) {
        e.ai2 = enraged ? 3.5 : 5;
        const a = Math.atan2(dy, dx);
        for (let k = -4; k <= 4; k++) enemyShot(e.x, e.y, a + k * 0.14, 170, 14);
      }
    } else if (e.type === 'nameless') {
      if (e.ai <= 0) {
        e.ai = enraged ? 2 : 2.8;
        const off = Math.random();
        for (let k = 0; k < 18; k++) enemyShot(e.x, e.y, ((k + off) / 18) * Math.PI * 2, 140, 16);
      }
      if (e.ai2 <= 0) {
        e.ai2 = enraged ? 7 : 9;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          spawnFoe('shade', p.x + Math.cos(a) * 330, p.y + Math.sin(a) * 260);
        }
      }
    } else if (e.type === 'rimequeen') {
      // Spiralling rings of ice shards, and icicles that fall where you stand.
      if (e.ai <= 0) {
        e.ai = enraged ? 2.4 : 3.2;
        e.spin = (e.spin || 0) + 0.4;
        for (let k = 0; k < 14; k++) enemyShot(e.x, e.y, e.spin + (k / 14) * Math.PI * 2, 125, 14, '#7dd3fc');
      }
      if (e.ai2 <= 0) {
        e.ai2 = enraged ? 4.2 : 5.5;
        hazard(p.x, p.y, 50, 1.1, 20, 'ice');
        for (let k = 0; k < (enraged ? 7 : 5); k++) hazard(p.x + rand(-180, 180), p.y + rand(-130, 130), 44, 1.1 + k * 0.08, 20, 'ice');
        if (enraged) for (let k = 0; k < 4; k++) spawnFoe('frostling', e.x + rand(-40, 40), e.y + rand(-40, 40));
      }
    } else if (e.type === 'tyrant') {
      // A fan of fireballs, and rings of eruptions around you.
      if (e.ai <= 0) {
        e.ai = enraged ? 2.2 : 3;
        const a = Math.atan2(dy, dx);
        for (let k = -3; k <= 3; k++) enemyShot(e.x, e.y, a + k * 0.16, 175, 15, '#fb923c');
      }
      if (e.ai2 <= 0) {
        e.ai2 = enraged ? 4.8 : 6.2;
        const n = 7;
        const off = Math.random() * Math.PI;
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * Math.PI * 2;
          hazard(p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 115, 42, 1.2, 22, 'fire');
        }
        hazard(p.x, p.y, 54, 1.4, 22, 'fire');
        for (let k = 0; k < (enraged ? 6 : 3); k++) spawnFoe('cinder', e.x + rand(-40, 40), e.y + rand(-40, 40));
      }
    }
    return null;
  }

  function hurtFoe(e, dmg, wid, fromX, fromY, knock) {
    if (e.dead) return;
    e.hp -= dmg;
    // Flash white briefly, but not continuously while something is hit nonstop.
    if (e.flash <= -0.12) e.flash = 0.08;
    if (wid) state.dmgBy[wid] = (state.dmgBy[wid] || 0) + Math.min(dmg, e.hp + dmg);
    if (knock && e.heavy < 1) {
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      const k = knock * 22 * (1 - e.heavy);
      e.kx += (dx / d) * k;
      e.ky += (dy / d) * k;
    }
    if (state.texts.length < 70 && !e.prop && !simulating && setting('dmg')) {
      // Bigger hits get bigger, warmer numbers that pop in and arc away.
      const tier = dmg < 25 ? 0 : dmg < 80 ? 1 : dmg < 200 ? 2 : 3;
      state.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, vx: rand(-25, 25), vy: -70 - tier * 12, text: String(Math.round(dmg)), life: 0.65, max: 0.65, size: 11 + tier * 2.5, color: DMG_COLORS[tier] });
    }
    Sound.hit();
    if (e.hp <= 0) killFoe(e);
  }

  function killFoe(e) {
    e.dead = true;
    const def = FOES[e.type];
    if (e.prop) {
      const kind = weighted([['coin', 40], ['food', 26], ['bag', 10], ['magnet', 12], ['bomb', 8]]);
      state.pickups.push({ x: e.x, y: e.y, kind, fly: false, vx: 0, vy: 0, t: 0 });
      burst(e.x, e.y, '#fb923c', 14, 150);
      return;
    }
    state.kills++;
    Sound.die();
    deathFx(e);
    if (e.xp) dropGem(e.x, e.y, e.xp);
    if (def.shatter) {
      // Rime golems burst into ice shards.
      const n = e.elite ? 12 : 6;
      const off = Math.random();
      for (let k = 0; k < n; k++) enemyShot(e.x, e.y, ((k + off) / n) * Math.PI * 2, 120, 6, '#7dd3fc');
    }
    if (Math.random() < 0.012) state.pickups.push({ x: e.x + 8, y: e.y, kind: 'coin', fly: false, vx: 0, vy: 0, t: 0 });
    if (def.split) {
      for (let k = 0; k < (e.elite ? 6 : 2); k++) spawnFoe(def.split, e.x + rand(-10, 10), e.y + rand(-10, 10));
    }
    if (e.elite || e.boss) {
      state.pickups.push({ x: e.x, y: e.y, kind: 'chest', boss: e.boss, fly: false, vx: 0, vy: 0, t: 0 });
      // A beat of hit-stop and a camera kick sell the big kill.
      shake(e.boss ? 16 : 7);
      state.hitstop = Math.max(state.hitstop, e.boss ? 0.32 : 0.07);
      state.kick = Math.max(state.kick || 0, e.boss ? 1 : 0.45);
      if (e.elite) Sound.slam();
    }
    if (e.boss) {
      Sound.boom();
      if (state.bossId === e.id) state.bossId = 0;
      for (let k = 0; k < 8; k++) dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), 40);
      for (let k = 0; k < 6; k++) state.pickups.push({ x: e.x + rand(-50, 50), y: e.y + rand(-50, 50), kind: 'coin', fly: false, vx: 0, vy: 0, t: 0 });
      if (def.final) {
        state.won = true;
        state.winTime = state.t;
        state.endT = 2.5;
        state.banner = { text: 'The Nameless falls', sub: 'You survived', t: 3 };
        for (const o of state.foes) if (!o.prop && !o.dead) { o.dead = true; burst(o.x, o.y, foeColor(o.type), 4, 100); }
        Sound.win();
      }
    }
  }

  function dropGem(x, y, v) {
    const gems = state.gems;
    if (gems.length > 360) {
      // Too many gems: fold this one into the nearest.
      let best = null;
      let bd = Infinity;
      for (const g of gems) {
        const d = dist2(x, y, g.x, g.y);
        if (d < bd) { bd = d; best = g; }
      }
      best.v += v;
      return;
    }
    gems.push({ x, y, v, fly: false, vx: 0, vy: 0 });
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function updatePlayer(dt) {
    const p = state.p;
    let mx = 0;
    let my = 0;
    if (AUTOPLAY || simulating) {
      ({ mx, my } = botMove());
    } else if (input.stick) {
      const s = input.stick;
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const k = Math.min(1, d / 50);
        mx = (dx / d) * k;
        my = (dy / d) * k;
      }
    } else {
      const k = input.keys;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      if (k.has('w') || k.has('arrowup')) my -= 1;
      if (k.has('s') || k.has('arrowdown')) my += 1;
      const d = Math.hypot(mx, my);
      if (d > 0) {
        mx /= d;
        my /= d;
      }
    }
    const m = Math.hypot(mx, my);
    p.moving = m > 0.05;
    if (p.moving) {
      p.face = { x: mx / m, y: my / m };
      if (Math.abs(mx) > 0.1) p.faceX = mx > 0 ? 1 : -1;
      p.walk += dt * 10 * m;
    }
    const spd = state.st.speed * (p.chill > 0 ? 0.78 : 1); // frost imps chill you
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
    state.moved += Math.hypot(mx, my) * spd * dt;
    p.chill -= dt;
    p.hurtT -= dt;
    p.iframe -= dt;
    p.hp = Math.min(p.maxHp, p.hp + state.st.regen * dt);
  }

  function hurtPlayer(dmg, from = 'shot') {
    const p = state.p;
    if (p.iframe > 0 || state.won || state.mode !== 'playing' || state.slowmo) return;
    const d = Math.max(1, dmg - state.st.armor);
    state.hurtBy[from] = (state.hurtBy[from] || 0) + d;
    p.hp -= d;
    p.hurtT = 0.18;
    shake(d >= 15 ? 5 : 3);
    Sound.hurt();
    if (p.hp <= 0) {
      if ((save.shop.revival || 0) > 0 && !state.revived) {
        state.revived = true;
        p.hp = p.maxHp * 0.5;
        p.iframe = 2.5;
        nova();
        state.hitstop = 0.25;
        state.banner = { text: 'Revived', sub: '', t: 1.8 };
        Sound.heal();
      } else {
        p.hp = 0;
        state.endT = 1.4;
        Sound.lose();
      }
    }
  }

  function heal(v) {
    const p = state.p;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + v);
    if (p.hp - before >= 1 && !simulating) state.texts.push({ x: p.x, y: p.y - 30, vx: 0, vy: -40, text: `+${Math.round(p.hp - before)}`, life: 0.8, max: 0.8, size: 15, color: '#4ade80', heal: true });
  }

  // Clears every normal enemy on screen.
  function nova() {
    state.fx.push({ kind: 'nova', x: state.p.x, y: state.p.y, t: 0, life: 0.6 });
    shake(10);
    Sound.boom();
    for (const e of state.foes) {
      if (e.dead || e.prop || !onScreen(e, 40)) continue;
      if (e.boss) hurtFoe(e, 400, null, state.p.x, state.p.y, 0);
      else hurtFoe(e, e.hp + 1, null, state.p.x, state.p.y, 0);
    }
  }

  function gainXp(v) {
    state.xp += v * state.st.growth;
    while (state.xp >= state.xpNeed) {
      state.xp -= state.xpNeed;
      state.level++;
      state.lvlFlash = 1;
      state.xpNeed = xpFor(state.level);
      state.pending++;
    }
  }

  function updatePickups(dt) {
    const p = state.p;
    const mag = state.st.magnet;
    const mag2 = mag * mag;
    const reach = (p.r + 8) * (p.r + 8);
    const pull = (g) => {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!g.fly && d * d < mag2) {
        g.fly = true;
        // A little hop away first, like it is being plucked from the ground.
        g.vx = (-dx / d) * 120;
        g.vy = (-dy / d) * 120;
      }
      if (g.fly) {
        const acc = 1600;
        g.vx += (dx / d) * acc * dt;
        g.vy += (dy / d) * acc * dt;
        const sp = Math.hypot(g.vx, g.vy);
        const max = 700;
        if (sp > max) {
          g.vx *= max / sp;
          g.vy *= max / sp;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
      }
      return dist2(p.x, p.y, g.x, g.y) < reach;
    };

    const gems = state.gems;
    for (let i = gems.length - 1; i >= 0; i--) {
      if (pull(gems[i])) {
        gainXp(gems[i].v);
        sparkle(gems[i]);
        gems[i] = gems[gems.length - 1];
        gems.pop();
        Sound.gem();
      }
    }

    const pk = state.pickups;
    for (let i = pk.length - 1; i >= 0; i--) {
      const it = pk[i];
      it.t += dt;
      if (it.kind === 'chest' ? dist2(p.x, p.y, it.x, it.y) < (p.r + 16) ** 2 : pull(it)) {
        pk.splice(i, 1);
        collect(it);
      }
    }
  }

  function collect(it) {
    const st = state.st;
    if (it.kind === 'coin' || it.kind === 'bag') {
      const v = Math.round((it.kind === 'bag' ? 10 : 1) * st.greed * 10) / 10;
      state.gold += v;
      Sound.coin();
    } else if (it.kind === 'food') {
      heal(30);
      Sound.heal();
    } else if (it.kind === 'magnet') {
      for (const g of state.gems) g.fly = true;
      Sound.levelup();
    } else if (it.kind === 'bomb') {
      nova();
    } else if (it.kind === 'chest') {
      if (!simulating && state.weapons.some(canEvolve)) {
        // An evolution is coming: time slows down first.
        state.slowmo = { t: 0, boss: it.boss };
        Sound.whoosh();
      } else openChest(it.boss);
    }
  }

  // A few bright motes where a soul gem is absorbed.
  function sparkle(g) {
    state.xpPulse = 0.25;
    if (simulating || state.parts.length > 420) return;
    const p = state.p;
    const c = gemColor(g.v);
    for (let k = 0; k < 3; k++) {
      state.parts.push({ x: p.x + rand(-8, 8), y: p.y + rand(-14, 4), vx: rand(-40, 40), vy: rand(-110, -50), life: rand(0.25, 0.45), max: 0.45, color: c, size: rand(1.5, 2.6), glow: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Weapons
  // ---------------------------------------------------------------------------

  // Starts a volley every cooldown; volley shots are spaced by `gap` seconds.
  function volley(w, dt, gap, fire) {
    const s = w.s;
    w.t -= dt;
    if (w.t <= 0) {
      w.t += s.cd;
      if (w.t < 0) w.t = 0;
      w.queue = s.amount;
      w.qt = 0;
      w.shot = 0;
      if (w.start) w.start(w);
    }
    if (w.queue > 0) {
      w.qt -= dt;
      while (w.queue > 0 && w.qt <= 0) {
        fire(w, w.shot++);
        w.queue--;
        w.qt += gap;
      }
    }
  }

  function addShot(o) {
    state.shots.push({ hit: new Set(), life: 2, rot: 0, ...o });
  }

  function updateWeapons(dt) {
    const p = state.p;
    for (const w of state.weapons) {
      const s = w.s;
      if (w.id === 'bolt') {
        volley(w, dt, w.evolved ? 0.05 : 0.08, (w, k) => {
          if (k === 0) w.targets = nearestFoes(p.x, p.y, w.evolved ? 6 : s.amount);
          const t = w.evolved ? pick(w.targets.length ? w.targets : [null]) : w.targets[k % Math.max(1, w.targets.length)];
          let a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x);
          if (w.evolved) a += rand(-0.08, 0.08);
          const sp = 440 * s.speed;
          addShot({ kind: w.evolved ? 'star' : 'bolt', wid: w.id, x: p.x, y: p.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 * Math.sqrt(s.area), dmg: s.dmg, pierce: s.pierce, knock: s.knock, life: 1.5 });
          Sound.shoot();
        });
      } else if (w.id === 'daggers') {
        volley(w, dt, w.evolved ? 0.045 : 0.06, (w, k) => {
          const f = p.face;
          const side = w.evolved ? rand(-10, 10) : ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 7);
          const a = Math.atan2(f.y, f.x) + (w.evolved ? rand(-0.06, 0.06) : 0);
          const sp = 700 * s.speed;
          addShot({ kind: 'dagger', wid: w.id, x: p.x - f.y * side, y: p.y - 4 + f.x * side, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 * Math.sqrt(s.area), dmg: s.dmg, pierce: s.pierce, knock: s.knock, life: 0.9 });
          Sound.shoot();
        });
      } else if (w.id === 'axe') {
        volley(w, dt, 0.1, () => {
          const vx = rand(-150, 150) + p.faceX * 30 + (p.moving ? p.face.x * 60 : 0);
          addShot({ kind: 'axe', wid: w.id, x: p.x, y: p.y - 10, vx: vx * s.speed, vy: -620 * Math.sqrt(s.speed), grav: 1150, r: 13 * s.area, dmg: s.dmg, pierce: s.pierce, knock: s.knock, life: 2 });
          Sound.swish();
        });
      } else if (w.id === 'scythe') {
        volley(w, dt, 0.14, (w, k) => {
          const side = k % 2 === 0 ? p.faceX : -p.faceX;
          slash(w, side);
        });
      } else if (w.id === 'flask') {
        volley(w, dt, 0.12, (w, k) => {
          if (k === 0) w.targets = nearestFoes(p.x, p.y, 8, 320);
          const t = w.targets.length ? pick(w.targets) : null;
          const tx = t ? t.x + rand(-20, 20) : p.x + rand(-200, 200);
          const ty = t ? t.y + rand(-20, 20) : p.y + rand(-160, 160);
          state.shots.push({ kind: 'flask', wid: w.id, x: p.x, y: p.y - 10, sx: p.x, sy: p.y - 10, tx, ty, t: 0, flight: 0.5, life: 1, rot: 0, hit: null });
        });
      } else if (w.id === 'strike') {
        volley(w, dt, 0.09, (w, k) => {
          if (k === 0) {
            w.targets = state.foes.filter((e) => !e.dead && !e.prop && onScreen(e, -20));
          }
          if (!w.targets.length) return;
          const i = (Math.random() * w.targets.length) | 0;
          const t = w.targets[i];
          w.targets.splice(i, 1);
          lightning(w, t);
        });
      } else if (w.id === 'glaive') {
        volley(w, dt, w.evolved ? 0 : 0.12, (w, k) => {
          let a;
          if (w.evolved) {
            // A full ring, turned a little each volley.
            if (k === 0) w.phase += 0.45;
            a = w.phase + (k / s.amount) * Math.PI * 2;
          } else {
            if (k === 0) w.targets = nearestFoes(p.x, p.y, s.amount, 420);
            const t = w.targets[k % Math.max(1, w.targets.length)];
            a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x) + k * 0.6;
          }
          const sp = 600 * s.speed;
          addShot({ kind: 'glaive', wid: w.id, x: p.x, y: p.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 14 * s.area, dmg: s.dmg, pierce: 999, knock: s.knock, life: 3.5, t: 0, out: 0.7, back: false, evo: w.evolved });
          Sound.swish();
        });
      } else if (w.id === 'spikes') {
        volley(w, dt, w.evolved ? 0 : 0.15, (w, k) => {
          let a;
          if (w.evolved) {
            if (k === 0) w.phase += 0.4;
            a = w.phase + (k / s.amount) * Math.PI * 2;
          } else {
            if (k === 0) w.targets = nearestFoes(p.x, p.y, s.amount, 420);
            const t = w.targets[k % Math.max(1, w.targets.length)];
            a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.face.y, p.face.x) + k * 0.6;
          }
          // Each line erupts one spike at a time, marching outward.
          state.shots.push({ kind: 'spikes', wid: w.id, x: p.x, y: p.y + 6, dx: Math.cos(a), dy: Math.sin(a), n: w.evolved ? 7 : 6, k: 0, tick: 0, life: 2, rot: 0, hit: null, dmg: s.dmg, area: s.area, knock: s.knock });
          if (k === 0) Sound.swish();
        });
      } else if (w.id === 'orbit') {
        updateOrbit(w, dt);
      } else if (w.id === 'aura') {
        w.t -= dt;
        w.phase += dt;
        if (w.t <= 0) {
          w.t += s.cd;
          const R = 72 * s.area;
          query(p.x, p.y, R, (e) => {
            hurtFoe(e, s.dmg, w.id, p.x, p.y, s.knock);
            if (w.evolved) e.slow = 0.6;
          });
          if (w.evolved) heal(0.4);
        }
      }
    }
  }

  function slash(w, side) {
    const p = state.p;
    const s = w.s;
    const len = 150 * s.area;
    const hh = 26 * s.area;
    const cx = p.x + side * (len / 2 + 6);
    const cy = p.y - 4;
    let hits = 0;
    query(cx, cy, len / 2, (e) => {
      if (Math.abs(e.y - cy) > hh + e.r) return;
      if (Math.abs(e.x - cx) > len / 2 + e.r) return;
      hurtFoe(e, s.dmg, w.id, p.x, p.y, s.knock);
      hits++;
    });
    if (w.evolved && hits) heal(Math.min(4, hits * 0.5));
    state.fx.push({ kind: 'slash', x: cx, y: cy, side, len, hh, t: 0, life: 0.22, evo: w.evolved });
    Sound.swish();
  }

  function lightning(w, t) {
    const s = w.s;
    const R = 36 * s.area;
    const hit = (x, y) => {
      query(x, y, R, (e) => hurtFoe(e, s.dmg, w.id, x, y, 0));
      state.fx.push({ kind: 'strike', x, y, r: R, t: 0, life: 0.3, seed: Math.random() });
    };
    hit(t.x, t.y);
    if (w.evolved) {
      // Chain to up to three nearby enemies.
      let from = t;
      const seen = new Set([t]);
      for (let c = 0; c < 3; c++) {
        let next = null;
        let bd = 170 * 170;
        query(from.x, from.y, 170, (e) => {
          if (seen.has(e) || e.prop) return;
          const d = dist2(from.x, from.y, e.x, e.y);
          if (d < bd) { bd = d; next = e; }
        });
        if (!next) break;
        seen.add(next);
        state.fx.push({ kind: 'chain', x: from.x, y: from.y, x2: next.x, y2: next.y, t: 0, life: 0.25, seed: Math.random() });
        query(next.x, next.y, R * 0.6, (e) => hurtFoe(e, s.dmg * 0.7, w.id, next.x, next.y, 0));
        from = next;
      }
    }
    Sound.zap();
  }

  function orbitShards(w) {
    const p = state.p;
    const s = w.s;
    const n = s.amount;
    const R = 72 * s.area;
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = w.phase + (k / n) * Math.PI * 2;
      out.push({ x: p.x + Math.cos(a) * R, y: p.y - 4 + Math.sin(a) * R, a });
    }
    return out;
  }

  function updateOrbit(w, dt) {
    const s = w.s;
    if (!w.evolved) {
      if (w.active > 0) {
        w.active -= dt;
        if (w.active <= 0) w.t = s.cd;
      } else {
        w.t -= dt;
        if (w.t <= 0) w.active = s.dur;
      }
      if (w.active <= 0) return;
    }
    w.phase += dt * 3.3 * s.speed;
    const r = 11 * Math.sqrt(s.area);
    const p = state.p;
    for (const sh of orbitShards(w)) {
      query(sh.x, sh.y, r, (e) => {
        if (e.orbCd > 0) return;
        e.orbCd = 0.45;
        hurtFoe(e, s.dmg, w.id, p.x, p.y, s.knock);
      });
    }
  }

  function updateShots(dt) {
    const shots = state.shots;
    const p = state.p;
    for (let i = shots.length - 1; i >= 0; i--) {
      const b = shots[i];
      b.life -= dt;
      if (b.kind === 'flask') {
        b.t += dt;
        const k = Math.min(1, b.t / b.flight);
        b.x = b.sx + (b.tx - b.sx) * k;
        b.y = b.sy + (b.ty - b.sy) * k - Math.sin(k * Math.PI) * 60;
        b.rot += dt * 12;
        if (k >= 1) {
          const w = state.weapons.find((o) => o.id === 'flask');
          if (w) {
            const s = w.s;
            state.pools.push({ x: b.tx, y: b.ty, r: 40 * s.area, life: s.dur, max: s.dur, tick: 0, dmg: s.dmg, evo: w.evolved, seed: Math.random() * 10 });
            Sound.burn();
          }
          shots.splice(i, 1);
        }
        continue;
      }
      if (b.kind === 'spikes') {
        b.tick -= dt;
        while (b.tick <= 0 && b.k < b.n) {
          b.tick += 0.055;
          const d = 34 + b.k * 34 * b.area;
          const x = b.x + b.dx * d;
          const y = b.y + b.dy * d;
          query(x, y, 22 * b.area, (e) => hurtFoe(e, b.dmg, 'spikes', b.x, b.y, b.knock));
          if (!simulating) state.fx.push({ kind: 'spike', x, y, s: b.area, t: 0, life: 0.45, flip: Math.random() < 0.5 });
          b.k++;
        }
        if (b.k >= b.n) shots.splice(i, 1);
        continue;
      }
      if (b.kind === 'glaive') {
        // Slows to a stop, then flies home faster and faster.
        b.t += dt;
        b.rot += dt * 18;
        if (!b.back) {
          const k = Math.max(0, 1 - b.t / b.out);
          if (b.evo) {
            // Evolved glaives curve as they go, sweeping the ring.
            const c = Math.cos(dt * 2.4);
            const sn = Math.sin(dt * 2.4);
            const vx = b.vx * c - b.vy * sn;
            b.vy = b.vx * sn + b.vy * c;
            b.vx = vx;
          }
          b.x += b.vx * k * dt;
          b.y += b.vy * k * dt;
          if (b.t >= b.out) {
            b.back = true;
            b.hit.clear(); // it can hit everything again on the way back
          }
        } else {
          const dx = p.x - b.x;
          const dy = p.y - 6 - b.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 20 || b.life <= 0) {
            shots.splice(i, 1);
            continue;
          }
          const sp = Math.min(1000, 150 + (b.t - b.out) * 1500);
          b.vx = (dx / d) * sp;
          b.vy = (dy / d) * sp;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
      } else {
        if (b.grav) b.vy += b.grav * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += dt * (b.kind === 'axe' ? 14 : 0);
        if (b.life <= 0 || Math.abs(b.x - p.x) > W || Math.abs(b.y - p.y) > H) {
          shots.splice(i, 1);
          continue;
        }
      }
      query(b.x, b.y, b.r, (e) => {
        if (b.hit.has(e.id)) return;
        b.hit.add(e.id);
        hurtFoe(e, b.dmg, b.wid, b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.knock);
        if (!e.prop) b.pierce--;
        if (b.pierce <= 0) return false;
      });
      if (b.pierce <= 0) {
        if (b.kind !== 'dagger') burst(b.x, b.y, b.kind === 'bolt' ? '#c084fc' : '#fde68a', 4, 90);
        shots.splice(i, 1);
      }
    }

    const es = state.eshots;
    for (let i = es.length - 1; i >= 0; i--) {
      const b = es[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 3) ** 2) {
        hurtPlayer(b.dmg);
        es.splice(i, 1);
      } else if (b.life <= 0) es.splice(i, 1);
    }

    const pools = state.pools;
    for (let i = pools.length - 1; i >= 0; i--) {
      const pl = pools[i];
      pl.life -= dt;
      pl.tick -= dt;
      if (pl.evo) {
        const t = nearestFoes(pl.x, pl.y, 1, 300)[0];
        if (t) {
          const dx = t.x - pl.x;
          const dy = t.y - pl.y;
          const d = Math.hypot(dx, dy) || 1;
          pl.x += (dx / d) * 40 * dt;
          pl.y += (dy / d) * 40 * dt;
        }
      }
      if (pl.tick <= 0) {
        pl.tick = 0.45;
        query(pl.x, pl.y, pl.r, (e) => hurtFoe(e, pl.dmg, 'flask', pl.x, pl.y, 0));
      }
      if (pl.life <= 0) pools.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Level ups and chests
  // ---------------------------------------------------------------------------

  function upgradeOptions() {
    const opts = [];
    for (const w of state.weapons) {
      if (!w.evolved && w.level < WEAPON_MAX) opts.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 1.2 });
    }
    if (state.weapons.length < MAX_SLOTS) {
      for (const id of Object.keys(WEAPONS)) {
        if (!state.weapons.some((w) => w.id === id)) opts.push({ kind: 'weapon', id, level: 1, weight: 0.9 });
      }
    }
    for (const ps of state.passives) {
      if (ps.level < PASSIVES[ps.id].max) opts.push({ kind: 'passive', id: ps.id, level: ps.level + 1, weight: 1 });
    }
    if (state.passives.length < MAX_SLOTS) {
      for (const id of Object.keys(PASSIVES)) {
        if (!hasPassive(id)) opts.push({ kind: 'passive', id, level: 1, weight: 0.8 });
      }
    }
    return opts;
  }

  function buildChoices() {
    const opts = upgradeOptions();
    const out = [];
    while (out.length < 3 && opts.length) {
      const i = weighted(opts.map((o, k) => [k, o.weight]));
      out.push(opts[i]);
      opts.splice(i, 1);
    }
    if (!out.length) {
      out.push({ kind: 'gold', v: 25 }, { kind: 'heal', v: 40 });
    }
    return out;
  }

  function openLevelUp() {
    state.mode = 'levelup';
    state.choices = buildChoices();
    state.choiceT = 0;
    Sound.levelup();
  }

  function applyUpgrade(o) {
    if (o.kind === 'weapon') {
      const w = state.weapons.find((x) => x.id === o.id);
      if (w) w.level++;
      else addWeapon(o.id);
    } else if (o.kind === 'passive') {
      const ps = state.passives.find((x) => x.id === o.id);
      if (ps) ps.level++;
      else state.passives.push({ id: o.id, level: 1 });
    } else if (o.kind === 'gold') {
      state.gold += o.v;
    } else if (o.kind === 'heal') {
      heal(o.v);
    }
    computeStats();
  }

  function choose(k) {
    if (state.mode !== 'levelup' || !state.choices[k]) return;
    applyUpgrade(state.choices[k]);
    Sound.click();
    afterChoice();
  }

  function afterChoice() {
    state.pending--;
    if (state.pending > 0) openLevelUp();
    else {
      state.mode = 'playing';
      state.choices = null;
      state.lvlFlash = 1;
      if (!simulating) {
        state.fx.push({ kind: 'lvl', x: state.p.x, y: state.p.y, t: 0, life: 0.6 });
        burst(state.p.x, state.p.y, '#fde68a', 18, 220, true);
      }
    }
  }

  function reroll() {
    if (state.mode !== 'levelup' || state.rerolls <= 0) return;
    state.rerolls--;
    state.choices = buildChoices();
    state.choiceT = 0;
    Sound.click();
  }

  function skip() {
    if (state.mode !== 'levelup') return;
    Sound.click();
    afterChoice();
  }

  function openChest(boss) {
    const rewards = [];
    const n = boss ? 3 : Math.random() < 0.15 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const w = state.weapons.find(canEvolve);
      if (w) {
        w.evolved = true;
        rewards.push({ kind: 'evo', id: w.id });
        computeStats();
        continue;
      }
      const opts = upgradeOptions().filter((o) => o.level > 1);
      if (opts.length) {
        const o = pick(opts);
        applyUpgrade(o);
        rewards.push(o);
      } else {
        const v = 50;
        state.gold += v;
        rewards.push({ kind: 'gold', v });
      }
    }
    const gold = Math.round((boss ? 100 : 30) * state.st.greed);
    state.gold += gold;
    // Timeline: an evolution reveal first (if any), then each reward spins
    // like a slot reel and lands one after another.
    const evo = rewards.some((r) => r.kind === 'evo');
    const r0 = evo ? EVO_REVEAL : 0;
    const lands = rewards.map((_, i) => r0 + 0.95 + i * 0.45);
    state.chest = { rewards, gold, t: 0, evo, r0, lands, landed: rewards.map(() => false), done: lands[lands.length - 1] + 0.25, skipped: false };
    state.mode = 'chest';
    if (evo) Sound.evolve();
    else Sound.chest();
  }

  function closeChest() {
    if (state.mode !== 'chest') return;
    const ch = state.chest;
    if (ch.t < ch.done && !ch.skipped) {
      // The first press skips the animation; the next one collects.
      ch.skipped = true;
      ch.t = ch.done;
      ch.landed = ch.landed.map(() => true);
      return;
    }
    if (ch.t < 0.3) return;
    state.chest = null;
    state.mode = 'playing';
    Sound.click();
  }

  // ---------------------------------------------------------------------------
  // Step
  // ---------------------------------------------------------------------------

  function step(dt) {
    if (state.endT > 0) {
      state.endT -= dt;
      if (state.endT <= 0) finish();
      return;
    }
    state.t += dt;
    if (!state.won) director(dt);
    updatePlayer(dt);
    updateFoes(dt);
    buildGrid();
    updateWeapons(dt);
    updateShots(dt);
    updateHazards(dt);
    updatePickups(dt);
    if (state.foes.some((e) => e.dead)) state.foes = state.foes.filter((e) => !e.dead);
    if (state.pending > 0 && state.mode === 'playing' && state.endT <= 0 && !state.slowmo) openLevelUp();
  }

  function finish() {
    state.mode = 'over';
    state.cine = null;
    state.slowmo = null;
    const gold = Math.round(state.gold + (state.won ? 500 * (state.curse ? CURSE.gold : 1) : 0));
    state.earned = gold;
    save.gold += gold;
    save.runs++;
    // Lasting ten minutes opens the next map and the Curse.
    if (state.won || state.t >= 600) {
      save.veteran = true;
      const next = MAP_ORDER.find((id) => MAPS[id].unlock === state.map);
      if (next && !save.maps[next]) {
        save.maps[next] = true;
        state.unlocked = next;
      }
    }
    const run = { time: Math.floor(state.won ? state.winTime || state.t : state.t), level: state.level, kills: state.kills, won: state.won, char: state.char };
    const b = save.best;
    if (!b || (run.won && !b.won) || (run.won === b.won && run.time > b.time)) save.best = run;
    writeSave();
    showOverlay('over');
  }

  // ---------------------------------------------------------------------------
  // Autoplay bot (used for balance testing)
  // ---------------------------------------------------------------------------

  const bot = { gx: 0, gy: 0 };

  function botMove() {
    const p = state.p;
    let fx = 0;
    let fy = 0;
    for (const e of state.foes) {
      if (e.dead || e.prop) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const range = 150 + e.r * 2;
      if (d > range) continue;
      const k = ((range - d) / range) ** 2 * (e.boss ? 6 : e.elite ? 3 : 1);
      fx += (dx / d) * k;
      fy += (dy / d) * k;
    }
    for (const h of state.hazards) {
      if (h.done) continue;
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      const range = h.r + 30;
      if (d > range) continue;
      const k = ((range - d) / range) * 3;
      fx += (dx / d) * k;
      fy += (dy / d) * k;
    }
    for (const b of state.eshots) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 110) continue;
      const k = ((110 - d) / 110) ** 2 * 2;
      fx += (dx / d) * k;
      fy += (dy / d) * k;
    }
    // Head for the nearest gem, chest or pickup.
    let target = null;
    let bd = 420 * 420;
    for (const g of state.pickups) {
      const d = dist2(p.x, p.y, g.x, g.y) * (g.kind === 'chest' || (g.kind === 'food' && p.hp < p.maxHp * 0.6) ? 0.1 : 1);
      if (d < bd) { bd = d; target = g; }
    }
    for (const g of state.gems) {
      const d = dist2(p.x, p.y, g.x, g.y);
      if (d < bd) { bd = d; target = g; }
    }
    const danger = Math.hypot(fx, fy);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = danger > 1.2 ? 0.25 : 0.8;
      fx += (dx / d) * k;
      fy += (dy / d) * k;
    } else if (danger < 0.2) {
      // Drift in a slow circle so the world keeps moving.
      bot.gx = Math.cos(state.t * 0.2);
      bot.gy = Math.sin(state.t * 0.2);
      fx += bot.gx * 0.5;
      fy += bot.gy * 0.5;
    }
    const m = Math.hypot(fx, fy);
    if (m < 0.05) return { mx: 0, my: 0 };
    return { mx: fx / m, my: fy / m };
  }

  function botChoose() {
    const cs = state.choices;
    // Prefer weapon levels, then pairs for owned weapons, then anything.
    const score = (o) => {
      if (o.kind === 'weapon') return state.weapons.some((w) => w.id === o.id) ? 5 : 3 + Math.random();
      if (o.kind === 'passive') return state.weapons.some((w) => WEAPONS[w.id].pair === o.id) ? 4 : o.id === 'might' || o.id === 'haste' ? 3.5 : 2 + Math.random();
      return 0;
    };
    let best = 0;
    cs.forEach((o, k) => { if (score(o) > score(cs[best])) best = k; });
    choose(best);
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n, power, glow = false) {
    if (simulating) return;
    if (state.parts.length > 500) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(0.3, 1) * power;
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.6), max: 0.6, color, size: rand(1.5, 3.5), glow });
    }
  }

  // Screen shake, scaled by the setting (and off for reduced motion).
  function shake(v) {
    state.shake = Math.max(state.shake, v);
  }

  function deathFx(e) {
    if (simulating) return;
    const c = foeColor(e.type);
    const big = e.boss || e.elite;
    burst(e.x, e.y, c, e.boss ? 70 : e.elite ? 32 : 7, e.boss ? 320 : e.elite ? 220 : 140, big);
    if (state.fx.length < 160) state.fx.push({ kind: 'pop', x: e.x, y: e.y, r: e.r * (big ? 3.2 : 1.9), color: c, t: 0, life: big ? 0.55 : 0.26 });
    if (big) {
      // The soul escapes upward, and a white flash rings out.
      for (let k = 0; k < (e.boss ? 24 : 10); k++) {
        state.parts.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r * 0.5), vx: rand(-30, 30), vy: rand(-200, -80), life: rand(0.6, 1.1), max: 1.1, color: '#f5f3ff', size: rand(2, 4), glow: true, float: true });
      }
      state.fx.push({ kind: 'flash', x: e.x, y: e.y, r: e.boss ? 320 : 120, t: 0, life: e.boss ? 0.5 : 0.25 });
    }
  }

  function updateEffects(dt) {
    for (const f of state.fx) f.t += dt;
    state.fx = state.fx.filter((f) => f.t < f.life);
    const drag = Math.exp(-5 * dt);
    for (const q of state.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.float) q.vy *= Math.exp(-1.5 * dt);
      else {
        q.vx *= drag;
        q.vy *= drag;
      }
      q.life -= dt;
    }
    state.parts = state.parts.filter((q) => q.life > 0);
    for (const t of state.texts) {
      t.x += (t.vx || 0) * dt;
      t.y += (t.vy || -30) * dt;
      if (t.vy !== undefined) t.vy += 200 * dt;
      t.life -= dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    state.shake = Math.max(0, state.shake - dt * 30);
    state.kick = Math.max(0, (state.kick || 0) - dt * 3);
    state.lvlFlash = Math.max(0, state.lvlFlash - dt * 1.4);
    state.xpPulse = Math.max(0, state.xpPulse - dt);
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    if (state.mode === 'levelup') state.choiceT += dt;
    if (state.mode === 'chest') {
      const ch = state.chest;
      ch.t += dt;
      // Reels tick while they spin and ding as each one lands.
      ch.lands.forEach((at, i) => {
        if (ch.landed[i] || ch.t < at) return;
        ch.landed[i] = true;
        Sound.ding();
      });
      if (ch.t > ch.r0 + 0.4 && ch.landed.includes(false)) Sound.tick();
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas and sprites
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const SPR = 3; // sprites are pre-rendered at three times their size for sharpness
  const ICON_SPR = 4; // icons are shown large on cards and the evolution reveal

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth || W;
    // Cap the backing store so huge fullscreen displays stay fast.
    const cw = Math.min(3200, Math.round(w * dpr));
    canvas.width = cw;
    canvas.height = Math.round(cw * (H / W));
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  function makeCanvas(w, h, draw, scale = SPR) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.translate(w / 2, h / 2);
    draw(g);
    return c;
  }

  // A sprite plus its mirror image and white "hit flash" versions of both.
  function makeSprite(w, h, draw) {
    const base = makeCanvas(w, h, draw);
    const mirror = makeCanvas(w, h, (g) => {
      g.scale(-1, 1);
      draw(g);
    });
    const flash = (src) => {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(0, 0, c.width, c.height);
      return c;
    };
    return { w, h, img: [base, mirror], flash: [flash(base), flash(mirror)] };
  }

  const glowCache = new Map();
  function glow(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.6;
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }

  function drawGlow(x, y, r, color, c = ctx) {
    c.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  }

  function eyes(g, x, y, gap, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x - gap, y, r, 0, Math.PI * 2);
    g.arc(x + gap, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function blob(g, pts, color) {
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }

  // Foe sprites, drawn facing right around (0, 0).
  const FOE_ART = {
    wisp: [30, 34, (g) => {
      drawGlow(0, 2, 16, '#5eead4', g);
      g.fillStyle = '#99f6e4';
      g.beginPath();
      g.moveTo(-2, -15);
      g.bezierCurveTo(6, -8, 10, -2, 9, 4);
      g.arc(0, 4, 9, 0, Math.PI);
      g.bezierCurveTo(-10, -3, -6, -8, -2, -15);
      g.fill();
      g.fillStyle = '#ecfeff';
      g.beginPath();
      g.ellipse(1, 5, 4.5, 5, 0, 0, Math.PI * 2);
      g.fill();
      eyes(g, 2, 3, 3, 1.4, '#134e4a');
    }],
    husk: [30, 34, (g) => {
      g.fillStyle = '#4b5d4a';
      g.beginPath();
      g.roundRect(-8, -4, 15, 17, 5);
      g.fill();
      g.fillStyle = '#3a4a39';
      g.fillRect(-6, 11, 4, 5);
      g.fillRect(1, 11, 4, 5);
      g.strokeStyle = '#7d937b';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(3, 0);
      g.lineTo(12, 2);
      g.moveTo(-1, 2);
      g.lineTo(9, 5);
      g.stroke();
      g.fillStyle = '#8fa68c';
      g.beginPath();
      g.arc(2, -9, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2a1e';
      g.beginPath();
      g.arc(1, -10, 1.8, 0, Math.PI * 2);
      g.arc(6, -10, 1.8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(2, -6, 4, 1.5);
    }],
    moth: [28, 24, (g) => {
      g.fillStyle = '#a16207';
      g.beginPath();
      g.ellipse(-4, -5, 8, 6, -0.5, 0, Math.PI * 2);
      g.ellipse(-4, 5, 7, 5, 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fde68a';
      g.beginPath();
      g.arc(-5, -5, 2.2, 0, Math.PI * 2);
      g.arc(-5, 5, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#44260a';
      g.beginPath();
      g.ellipse(2, 0, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
      eyes(g, 8, 0, 1.8, 1.1, '#fca5a5');
    }],
    blob: [38, 34, (g) => {
      g.fillStyle = '#7e22ce';
      g.beginPath();
      g.moveTo(-15, 12);
      g.bezierCurveTo(-17, -4, -9, -14, 0, -14);
      g.bezierCurveTo(9, -14, 17, -4, 15, 12);
      g.closePath();
      g.fill();
      g.fillStyle = '#a855f7';
      g.beginPath();
      g.ellipse(-2, -2, 10, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(-7, -8, 3.5, 2.2, -0.6, 0, Math.PI * 2);
      g.fill();
      eyes(g, 4, -1, 4, 2.2, '#1e1b4b');
    }],
    blobling: [22, 20, (g) => {
      g.fillStyle = '#c026d3';
      g.beginPath();
      g.moveTo(-9, 7);
      g.bezierCurveTo(-10, -3, -5, -8, 0, -8);
      g.bezierCurveTo(5, -8, 10, -3, 9, 7);
      g.closePath();
      g.fill();
      eyes(g, 2, -1, 2.5, 1.5, '#1e1b4b');
    }],
    shade: [34, 36, (g) => {
      g.globalAlpha = 0.9;
      g.fillStyle = '#3b3486';
      g.beginPath();
      g.moveTo(-12, 14);
      g.lineTo(-12, -2);
      g.bezierCurveTo(-12, -18, 12, -18, 12, -2);
      g.lineTo(12, 14);
      for (let k = 0; k < 4; k++) g.quadraticCurveTo(9 - k * 6, 9, 6 - k * 6, 14);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      drawGlow(3, -4, 8, '#c4b5fd', g);
      eyes(g, 3, -4, 4, 2, '#ede9fe');
    }],
    hexer: [34, 38, (g) => {
      g.fillStyle = '#581c87';
      g.beginPath();
      g.moveTo(-10, 15);
      g.lineTo(-7, -6);
      g.quadraticCurveTo(0, -18, 7, -6);
      g.lineTo(10, 15);
      g.closePath();
      g.fill();
      g.fillStyle = '#1e0b33';
      g.beginPath();
      g.arc(1, -6, 5, 0, Math.PI * 2);
      g.fill();
      eyes(g, 2, -6, 2.2, 1, '#f0abfc');
      drawGlow(12, 2, 10, '#e879f9', g);
      g.fillStyle = '#f5d0fe';
      g.beginPath();
      g.arc(12, 2, 3.5, 0, Math.PI * 2);
      g.fill();
    }],
    brute: [50, 50, (g) => {
      g.fillStyle = '#7c2d12';
      g.beginPath();
      g.roundRect(-14, -10, 26, 28, 10);
      g.fill();
      g.fillStyle = '#9a3412';
      g.beginPath();
      g.ellipse(-2, 0, 11, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c2410c';
      g.beginPath();
      g.arc(2, -15, 8, 0, Math.PI * 2);
      g.fill();
      eyes(g, 5, -16, 2.6, 1.4, '#fef08a');
      g.fillStyle = '#fef3c7';
      g.fillRect(3, -11, 2, 3);
      g.fillRect(7, -11, 2, 3);
      // Club.
      g.save();
      g.translate(14, 2);
      g.rotate(-0.5);
      g.fillStyle = '#57301a';
      g.beginPath();
      g.roundRect(-2, -18, 7, 22, 3);
      g.fill();
      g.fillStyle = '#6b3b1f';
      g.beginPath();
      g.ellipse(1.5, -18, 6, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }],
    knight: [44, 46, (g) => {
      g.fillStyle = '#334155';
      g.beginPath();
      g.roundRect(-11, -6, 20, 22, 5);
      g.fill();
      g.fillStyle = '#475569';
      g.beginPath();
      g.roundRect(-9, -20, 18, 16, [8, 8, 3, 3]);
      g.fill();
      g.fillStyle = '#dc2626';
      g.fillRect(-2, -14, 10, 2.5);
      drawGlow(4, -13, 7, '#ef4444', g);
      // Shield.
      g.fillStyle = '#1e293b';
      g.beginPath();
      g.moveTo(8, -6);
      g.lineTo(18, -6);
      g.lineTo(18, 6);
      g.quadraticCurveTo(13, 14, 8, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = '#94a3b8';
      g.lineWidth = 1.5;
      g.stroke();
    }],
    wraith: [42, 48, (g) => {
      g.fillStyle = '#0f2e2e';
      g.beginPath();
      g.moveTo(-14, 20);
      g.lineTo(-10, -6);
      g.quadraticCurveTo(0, -24, 10, -6);
      g.lineTo(14, 20);
      g.lineTo(8, 14);
      g.lineTo(3, 21);
      g.lineTo(-2, 14);
      g.lineTo(-7, 21);
      g.closePath();
      g.fill();
      g.fillStyle = '#020617';
      g.beginPath();
      g.ellipse(2, -8, 6, 7, 0, 0, Math.PI * 2);
      g.fill();
      drawGlow(3, -8, 9, '#2dd4bf', g);
      eyes(g, 3, -8, 2.6, 1.3, '#99f6e4');
      g.strokeStyle = '#134e4a';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(6, 2);
      g.lineTo(16, 6);
      g.stroke();
    }],
    spiderling: [24, 20, (g) => {
      g.strokeStyle = '#1c1917';
      g.lineWidth = 1.6;
      g.beginPath();
      for (let k = -1.5; k <= 1.5; k++) {
        g.moveTo(0, 0);
        g.lineTo(-4 + k * 3, -8);
        g.moveTo(0, 0);
        g.lineTo(-4 + k * 3, 8);
      }
      g.stroke();
      g.fillStyle = '#292524';
      g.beginPath();
      g.ellipse(-2, 0, 6, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(5, 0, 3.5, 0, Math.PI * 2);
      g.fill();
      eyes(g, 6, -0.5, 1.4, 0.9, '#ef4444');
    }],
    frostling: [28, 32, (g) => {
      drawGlow(0, 2, 16, '#7dd3fc', g);
      g.fillStyle = '#7dd3fc';
      g.beginPath();
      g.moveTo(-8, 13);
      g.quadraticCurveTo(-11, -2, 0, -4);
      g.quadraticCurveTo(11, -2, 8, 13);
      g.closePath();
      g.fill();
      g.fillStyle = '#bae6fd';
      g.beginPath();
      g.ellipse(1, 4, 5, 7, 0, 0, Math.PI * 2);
      g.fill();
      // A crown of ice.
      blob(g, [[-7, -3], [-6, -13], [-2, -5], [1, -15], [3, -5], [7, -12], [8, -3]], '#e0f2fe');
      eyes(g, 3, 1, 3, 1.5, '#075985');
      g.strokeStyle = '#e0f2fe';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(7, 5);
      g.lineTo(12, 3);
      g.lineTo(13, 6);
      g.stroke();
    }],
    golem: [54, 56, (g) => {
      blob(g, [[-16, 21], [-19, -2], [-10, -16], [6, -18], [17, -6], [16, 21]], '#475569');
      blob(g, [[-14, 19], [-15, 0], [-6, -12], [6, -13], [13, -4], [12, 19]], '#64748b');
      // Ice growing from its back.
      drawGlow(-8, -16, 14, '#7dd3fc', g);
      blob(g, [[-15, -5], [-22, -22], [-8, -12]], '#bae6fd');
      blob(g, [[-9, -12], [-7, -27], [-1, -14]], '#e0f2fe');
      blob(g, [[-1, -14], [7, -24], [6, -12]], '#7dd3fc');
      g.fillStyle = '#1e293b';
      g.beginPath();
      g.roundRect(1, -7, 14, 7, 2);
      g.fill();
      drawGlow(8, -4, 8, '#38bdf8', g);
      eyes(g, 8, -4, 3, 1.5, '#e0f2fe');
      // Fists.
      g.fillStyle = '#334155';
      g.beginPath();
      g.roundRect(12, 3, 11, 13, 4);
      g.roundRect(-22, 5, 9, 12, 4);
      g.fill();
      g.fillStyle = '#94a3b8';
      g.fillRect(-10, 6, 8, 2);
      g.fillRect(-6, 12, 10, 2);
    }],
    cinder: [32, 28, (g) => {
      drawGlow(0, 0, 17, '#f97316', g);
      blob(g, [[-15, 0], [-5, -8], [4, -6], [9, 0], [4, 6], [-5, 8]], '#ea580c');
      blob(g, [[-12, -2], [-3, -5], [-1, 0], [-3, 5], [-12, 2]], '#fbbf24');
      g.fillStyle = '#1c1917';
      g.beginPath();
      g.arc(4, 0, 6, 0, Math.PI * 2);
      g.fill();
      eyes(g, 5.5, -1, 2.3, 1.3, '#fde68a');
      g.fillStyle = '#f97316';
      g.fillRect(4, 3, 5, 1.4);
    }],
    revenant: [48, 54, (g) => {
      // Tattered cape.
      blob(g, [[-12, -6], [-16, 22], [-10, 18], [-6, 24], [-2, 18], [2, 22], [4, -4]], '#1c1917');
      g.fillStyle = '#292524';
      g.beginPath();
      g.roundRect(-11, -6, 20, 24, 5);
      g.fill();
      g.fillStyle = '#44403c';
      g.beginPath();
      g.roundRect(-9, -21, 18, 16, [8, 8, 3, 3]);
      g.fill();
      drawGlow(4, -14, 9, '#fb923c', g);
      g.fillStyle = '#fdba74';
      g.fillRect(-1, -15, 9, 2.5);
      // Embers glowing through cracks in the armour.
      g.strokeStyle = '#ea580c';
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(-6, -2);
      g.lineTo(-2, 4);
      g.lineTo(-5, 10);
      g.moveTo(3, 0);
      g.lineTo(6, 7);
      g.stroke();
      // Greatsword.
      g.save();
      g.translate(11, 8);
      g.rotate(0.45);
      g.fillStyle = '#57534e';
      g.fillRect(-1.5, -30, 6, 30);
      g.fillStyle = '#fdba74';
      g.fillRect(3, -30, 1.5, 28);
      g.fillStyle = '#78350f';
      g.fillRect(-5, 0, 13, 3);
      g.fillRect(0, 3, 3, 6);
      g.restore();
    }],
    rimequeen: [112, 128, (g) => {
      drawGlow(0, -6, 62, '#38bdf8', g);
      // Hair streaming behind her.
      blob(g, [[-6, -38], [-30, -20], [-38, 10], [-24, 4], [-30, 26], [-12, 0]], '#bae6fd');
      // Gown.
      g.fillStyle = '#0c4a6e';
      g.beginPath();
      g.moveTo(-36, 60);
      g.lineTo(-14, -16);
      g.lineTo(16, -16);
      g.lineTo(36, 60);
      for (let k = 0; k < 6; k++) g.lineTo(36 - (k + 0.5) * 12, k % 2 ? 60 : 50);
      g.closePath();
      g.fill();
      blob(g, [[-16, 60], [-6, -12], [8, -12], [18, 60]], '#0ea5e9');
      blob(g, [[-6, 60], [0, -8], [6, 60]], '#7dd3fc');
      g.fillStyle = '#e0f2fe';
      g.fillRect(-16, -18, 32, 4);
      // Face and eyes.
      g.fillStyle = '#e0f2fe';
      g.beginPath();
      g.ellipse(3, -28, 11, 13, 0, 0, Math.PI * 2);
      g.fill();
      drawGlow(6, -28, 10, '#38bdf8', g);
      eyes(g, 6, -29, 4, 1.8, '#0369a1');
      // Crown of ice.
      drawGlow(2, -50, 18, '#e0f2fe', g);
      blob(g, [[-12, -38], [-11, -54], [-5, -42], [1, -63], [6, -42], [12, -55], [15, -38]], '#f0f9ff');
      // Staff with a crystal.
      g.strokeStyle = '#bae6fd';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(28, 58);
      g.lineTo(34, -36);
      g.stroke();
      drawGlow(34, -44, 16, '#7dd3fc', g);
      blob(g, [[34, -56], [40, -44], [34, -34], [28, -44]], '#e0f2fe');
    }],
    tyrant: [132, 128, (g) => {
      drawGlow(0, -4, 70, '#ea580c', g);
      g.fillStyle = '#1c1917';
      g.beginPath();
      g.roundRect(-24, 22, 15, 38, 6);
      g.roundRect(8, 22, 15, 38, 6);
      g.fill();
      blob(g, [[-36, 28], [-42, -8], [-22, -28], [22, -28], [42, -8], [36, 28]], '#292524');
      blob(g, [[-26, 24], [-30, -4], [-14, -20], [14, -20], [30, -4], [26, 24]], '#3f3a36');
      // Molten cracks.
      g.strokeStyle = '#f97316';
      g.lineWidth = 2.5;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-20, -14);
      g.lineTo(-10, -2);
      g.lineTo(-16, 10);
      g.lineTo(-6, 20);
      g.moveTo(12, -16);
      g.lineTo(6, -2);
      g.lineTo(16, 8);
      g.moveTo(-2, 4);
      g.lineTo(4, 14);
      g.stroke();
      drawGlow(-10, 2, 14, '#f97316', g);
      drawGlow(8, -4, 12, '#f97316', g);
      // Arms and claws.
      g.fillStyle = '#1c1917';
      g.beginPath();
      g.roundRect(-56, -18, 16, 40, 8);
      g.roundRect(40, -18, 16, 40, 8);
      g.fill();
      for (const x of [-52, -46, 44, 50]) blob(g, [[x - 2, 20], [x + 1, 30], [x + 4, 20]], '#fbbf24');
      // Horned head.
      blob(g, [[-6, -44], [-26, -62], [-14, -42]], '#57534e');
      blob(g, [[14, -44], [34, -62], [22, -42]], '#57534e');
      g.fillStyle = '#0c0a09';
      g.beginPath();
      g.arc(4, -38, 17, 0, Math.PI * 2);
      g.fill();
      drawGlow(9, -40, 16, '#f97316', g);
      eyes(g, 9, -41, 6, 3, '#fde68a');
      g.fillStyle = '#f97316';
      g.fillRect(-1, -30, 18, 3);
    }],
    colossus: [104, 110, (g) => {
      g.fillStyle = '#78716c';
      g.beginPath();
      g.roundRect(-30, -12, 56, 50, 16);
      g.fill();
      g.fillStyle = '#e7e5e4';
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.roundRect(-24, -4 + k * 10, 44, 5, 3);
        g.fill();
      }
      g.fillStyle = '#d6d3d1';
      g.fillRect(-4, -8, 6, 44);
      // Arms.
      g.fillStyle = '#a8a29e';
      g.beginPath();
      g.roundRect(-44, -8, 14, 44, 7);
      g.roundRect(26, -8, 14, 44, 7);
      g.fill();
      // Skull.
      g.fillStyle = '#f5f5f4';
      g.beginPath();
      g.arc(2, -30, 20, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-8, -18, 20, 10);
      g.fillStyle = '#1c1917';
      g.beginPath();
      g.ellipse(-5, -32, 5, 6, 0, 0, Math.PI * 2);
      g.ellipse(10, -32, 5, 6, 0, 0, Math.PI * 2);
      g.fill();
      drawGlow(-5, -32, 9, '#fb923c', g);
      drawGlow(10, -32, 9, '#fb923c', g);
      g.fillStyle = '#1c1917';
      for (let k = 0; k < 4; k++) g.fillRect(-6 + k * 5, -16, 2, 5);
    }],
    widow: [120, 100, (g) => {
      g.strokeStyle = '#1e1b2e';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const dx = -10 + k * 12;
        g.moveTo(dx, 0);
        g.quadraticCurveTo(dx - 12, -34, dx - 26 + k * 6, -44);
        g.moveTo(dx, 0);
        g.quadraticCurveTo(dx - 12, 34, dx - 26 + k * 6, 44);
      }
      g.stroke();
      g.fillStyle = '#2e1065';
      g.beginPath();
      g.ellipse(-24, 0, 30, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#dc2626';
      g.beginPath();
      g.moveTo(-32, -10);
      g.lineTo(-16, -10);
      g.lineTo(-24, 0);
      g.lineTo(-16, 10);
      g.lineTo(-32, 10);
      g.lineTo(-24, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#1e1b2e';
      g.beginPath();
      g.ellipse(14, 0, 16, 14, 0, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 6; k++) {
        const x = 18 + (k % 3) * 5;
        const y = -5 + Math.floor(k / 3) * 8;
        drawGlow(x, y, 5, '#ef4444', g);
        g.fillStyle = '#fca5a5';
        g.beginPath();
        g.arc(x, y, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }],
    nameless: [130, 140, (g) => {
      drawGlow(0, -10, 70, '#6d28d9', g);
      g.fillStyle = '#05030c';
      g.beginPath();
      g.moveTo(-44, 62);
      g.lineTo(-30, -20);
      g.quadraticCurveTo(0, -70, 30, -20);
      g.lineTo(44, 62);
      for (let k = 0; k < 6; k++) g.lineTo(44 - (k + 0.5) * 14.6, k % 2 ? 62 : 50);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7c3aed';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(2, -22, 18, 20, 0, 0, Math.PI * 2);
      g.fill();
      drawGlow(-5, -24, 10, '#f5f3ff', g);
      drawGlow(10, -24, 10, '#f5f3ff', g);
      eyes(g, 3, -24, 7, 3, '#fff');
      // A crown of small eyes.
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.32;
        const x = 2 + Math.cos(a) * 36;
        const y = -26 + Math.sin(a) * 36;
        g.fillStyle = '#1e1b4b';
        g.beginPath();
        g.ellipse(x, y, 4.5, 3, a, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c4b5fd';
        g.beginPath();
        g.arc(x, y, 1.5, 0, Math.PI * 2);
        g.fill();
      }
    }],
    brazier: [34, 44, (g) => {
      g.fillStyle = '#292524';
      g.fillRect(-2, 0, 4, 18);
      g.fillRect(-8, 16, 16, 3);
      g.fillStyle = '#44403c';
      g.beginPath();
      g.moveTo(-12, -4);
      g.lineTo(12, -4);
      g.lineTo(7, 4);
      g.lineTo(-7, 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#78716c';
      g.fillRect(-12, -5, 24, 2);
    }],
  };

  const FOE_COLORS = {
    wisp: '#5eead4', husk: '#8fa68c', moth: '#fbbf24', blob: '#a855f7', blobling: '#d946ef', shade: '#a5b4fc',
    hexer: '#e879f9', brute: '#ea580c', knight: '#94a3b8', wraith: '#2dd4bf', spiderling: '#a8a29e',
    colossus: '#f5f5f4', widow: '#dc2626', nameless: '#a78bfa', brazier: '#fb923c',
    frostling: '#7dd3fc', golem: '#bae6fd', cinder: '#fb923c', revenant: '#f97316', rimequeen: '#e0f2fe', tyrant: '#f97316',
  };
  const foeColor = (t) => FOE_COLORS[t] || '#fff';

  const sprites = {};
  for (const [k, [w, h, draw]] of Object.entries(FOE_ART)) sprites[k] = makeSprite(w, h, draw);

  // The hooded player, coloured per character.
  function drawHero(g, ch, step) {
    const legs = Math.sin(step) * 3;
    g.fillStyle = '#0f0a1a';
    g.fillRect(-5 + legs * 0.5, 9, 4, 6);
    g.fillRect(1 - legs * 0.5, 9, 4, 6);
    g.fillStyle = ch.cloak;
    g.beginPath();
    g.moveTo(-11, 12);
    g.lineTo(-8, -6);
    g.quadraticCurveTo(0, -22, 9, -6);
    g.lineTo(11, 12);
    g.closePath();
    g.fill();
    g.strokeStyle = ch.trim;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-11, 12);
    g.lineTo(11, 12);
    g.stroke();
    g.fillStyle = '#05030a';
    g.beginPath();
    g.ellipse(2, -7, 6, 6.5, 0, 0, Math.PI * 2);
    g.fill();
    eyes(g, 3.5, -7, 2.4, 1.2, ch.trim);
    // Staff with a small light.
    g.strokeStyle = '#6b4f2a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 14);
    g.lineTo(13, -14);
    g.stroke();
    drawGlow(13, -16, 9, ch.trim, g);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(13, -16, 2.2, 0, Math.PI * 2);
    g.fill();
  }

  const heroSprites = {};
  function heroSprite(charId, frame) {
    const key = `${charId}:${frame}`;
    if (!heroSprites[key]) heroSprites[key] = makeSprite(36, 40, (g) => drawHero(g, CHARS[charId], frame * (Math.PI / 2)));
    return heroSprites[key];
  }

  // Small icons for weapons, passives and pickups.
  const ICON_ART = {
    bolt: (g) => {
      drawGlow(0, 0, 14, '#c084fc', g);
      g.fillStyle = '#e9d5ff';
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#a855f7';
      g.beginPath();
      g.arc(-4, 4, 3, 0, Math.PI * 2);
      g.arc(-7, 7, 2, 0, Math.PI * 2);
      g.fill();
    },
    scythe: (g) => {
      g.strokeStyle = '#8b6b3e';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-8, 11);
      g.lineTo(5, -10);
      g.stroke();
      g.fillStyle = '#e2e8f0';
      g.beginPath();
      g.moveTo(5, -10);
      g.quadraticCurveTo(-8, -14, -12, -2);
      g.quadraticCurveTo(-6, -9, 5, -6);
      g.closePath();
      g.fill();
    },
    orbit: (g) => {
      drawGlow(0, 0, 13, '#fde68a', g);
      g.fillStyle = '#fef3c7';
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(4, -3, 8, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    },
    aura: (g) => {
      g.strokeStyle = '#fbbf24';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
        g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        g.stroke();
      }
      g.fillStyle = '#fde68a';
      g.beginPath();
      g.arc(0, 0, 3, 0, Math.PI * 2);
      g.fill();
    },
    daggers: (g) => {
      g.rotate(-0.8);
      g.fillStyle = '#e2e8f0';
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(3, 2);
      g.lineTo(-3, 2);
      g.closePath();
      g.fill();
      g.fillStyle = '#a16207';
      g.fillRect(-5, 2, 10, 2);
      g.fillStyle = '#57301a';
      g.fillRect(-1.5, 4, 3, 7);
    },
    axe: (g) => {
      g.rotate(0.4);
      g.fillStyle = '#6b4f2a';
      g.fillRect(-1.5, -4, 3, 16);
      g.fillStyle = '#cbd5e1';
      g.beginPath();
      g.moveTo(-1, -12);
      g.lineTo(11, -12);
      g.quadraticCurveTo(13, -3, 9, 2);
      g.lineTo(-1, 0);
      g.closePath();
      g.fill();
    },
    flask: (g) => {
      g.fillStyle = '#e7e5e4';
      g.fillRect(-2.5, -12, 5, 6);
      g.fillStyle = '#c2410c';
      g.beginPath();
      g.arc(0, 3, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fb923c';
      g.beginPath();
      g.arc(0, 5, 7, 0, Math.PI);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(-3, 0, 2, 0, Math.PI * 2);
      g.fill();
    },
    strike: (g) => {
      drawGlow(0, 0, 14, '#7dd3fc', g);
      blob(g, [[3, -14], [-7, 2], [0, 2], [-4, 14], [8, -3], [1, -3], [6, -14]], '#e0f2fe');
    },
    glaive: (g) => {
      drawGlow(0, 0, 14, '#67e8f9', g);
      for (let k = 0; k < 3; k++) {
        g.save();
        g.rotate((k / 3) * Math.PI * 2);
        g.fillStyle = k ? '#a5f3fc' : '#ecfeff';
        g.beginPath();
        g.moveTo(-1, -3);
        g.quadraticCurveTo(9, -14, 14, -3);
        g.quadraticCurveTo(8, -5, 3, 2);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.fillStyle = '#0e7490';
      g.beginPath();
      g.arc(0, 0, 3.5, 0, Math.PI * 2);
      g.fill();
    },
    spikes: (g) => {
      g.fillStyle = '#44403c';
      g.beginPath();
      g.ellipse(0, 10, 14, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      for (const [x, h, w] of [[-7, 15, 4], [1, 22, 5], [8, 13, 4]]) {
        blob(g, [[x - w, 10], [x, 10 - h], [x + w, 10]], '#e7e5e4');
        blob(g, [[x, 10 - h], [x + w, 10], [x + 1, 10]], '#a8a29e');
      }
    },
    might: (g) => {
      g.fillStyle = '#ef4444';
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(3, 3);
      g.lineTo(-3, 3);
      g.closePath();
      g.fill();
      g.fillStyle = '#fca5a5';
      g.fillRect(-6, 3, 12, 2.5);
      g.fillStyle = '#7f1d1d';
      g.fillRect(-1.5, 5, 3, 7);
    },
    haste: (g) => {
      g.fillStyle = '#fde68a';
      blob(g, [[-7, -11], [7, -11], [1, 0], [7, 11], [-7, 11], [-1, 0]], '#fcd34d');
      g.fillStyle = '#78350f';
      g.fillRect(-8, -13, 16, 2.5);
      g.fillRect(-8, 10.5, 16, 2.5);
    },
    reach: (g) => {
      g.strokeStyle = '#34d399';
      g.lineWidth = 2;
      for (const r of [4, 8, 12]) {
        g.globalAlpha = 1 - r / 20;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    focus: (g) => {
      g.fillStyle = '#e0f2fe';
      g.beginPath();
      g.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0284c7';
      g.beginPath();
      g.arc(0, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0c0a09';
      g.beginPath();
      g.arc(0, 0, 2.2, 0, Math.PI * 2);
      g.fill();
    },
    swift: (g) => {
      g.fillStyle = '#7dd3fc';
      blob(g, [[-10, -8], [0, 0], [-10, 8], [-6, 0]], '#38bdf8');
      blob(g, [[0, -8], [10, 0], [0, 8], [4, 0]], '#bae6fd');
    },
    vigor: (g) => {
      g.fillStyle = '#ef4444';
      g.beginPath();
      g.moveTo(0, 11);
      g.bezierCurveTo(-14, 1, -9, -12, 0, -5);
      g.bezierCurveTo(9, -12, 14, 1, 0, 11);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.arc(-5, -4, 2, 0, Math.PI * 2);
      g.fill();
    },
    renewal: (g) => {
      g.fillStyle = '#4ade80';
      g.beginPath();
      g.moveTo(0, 12);
      g.quadraticCurveTo(-13, -2, 0, -12);
      g.quadraticCurveTo(13, -2, 0, 12);
      g.fill();
      g.strokeStyle = '#14532d';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 11);
      g.lineTo(0, -8);
      g.stroke();
    },
    magnet: (g) => {
      g.strokeStyle = '#ef4444';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, -1, 7, Math.PI, 0);
      g.moveTo(-7, -1);
      g.lineTo(-7, 6);
      g.moveTo(7, -1);
      g.lineTo(7, 6);
      g.stroke();
      g.fillStyle = '#e2e8f0';
      g.fillRect(-9.5, 6, 5, 4);
      g.fillRect(4.5, 6, 5, 4);
    },
    echo: (g) => {
      g.fillStyle = '#c084fc';
      g.beginPath();
      g.arc(-4, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(3, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.3;
      g.beginPath();
      g.arc(9, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    },
    plating: (g) => {
      g.fillStyle = '#94a3b8';
      g.beginPath();
      g.moveTo(-10, -11);
      g.lineTo(10, -11);
      g.lineTo(10, 1);
      g.quadraticCurveTo(0, 14, -10, 1);
      g.closePath();
      g.fill();
      g.fillStyle = '#cbd5e1';
      g.fillRect(-1.5, -9, 3, 17);
    },
    coin: (g) => {
      g.fillStyle = '#b45309';
      g.beginPath();
      g.arc(0, 1, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fbbf24';
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fde68a';
      g.beginPath();
      g.arc(0, 0, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d97706';
      g.fillRect(-1.2, -3.5, 2.4, 7);
    },
    bag: (g) => {
      g.fillStyle = '#92400e';
      g.beginPath();
      g.ellipse(0, 3, 10, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-4, -9, 8, 6);
      g.fillStyle = '#fbbf24';
      g.beginPath();
      g.arc(0, 4, 4, 0, Math.PI * 2);
      g.fill();
    },
    food: (g) => {
      ICON_ART.vigor(g);
    },
    bomb: (g) => {
      drawGlow(0, 0, 14, '#f5f3ff', g);
      g.fillStyle = '#f5f3ff';
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        const r = k % 2 ? 4 : 11;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    },
    chest: (g) => {
      g.fillStyle = '#78350f';
      g.beginPath();
      g.roundRect(-13, -4, 26, 14, 2);
      g.fill();
      g.fillStyle = '#92400e';
      g.beginPath();
      g.roundRect(-13, -12, 26, 9, [6, 6, 0, 0]);
      g.fill();
      g.fillStyle = '#fbbf24';
      g.fillRect(-13, -4, 26, 2.5);
      g.fillRect(-2.5, -6, 5, 7);
      g.fillRect(-13, 7, 26, 2);
    },
  };

  const icons = {};
  for (const [k, draw] of Object.entries(ICON_ART)) icons[k] = makeCanvas(32, 32, draw, ICON_SPR);
  // Evolved weapons get a golden halo and a star badge ("bolt*").
  for (const id of Object.keys(WEAPONS)) {
    icons[`${id}*`] = makeCanvas(32, 32, (g) => {
      drawGlow(0, 0, 17, '#fde047', g);
      drawGlow(0, 0, 12, '#fef9c3', g);
      g.drawImage(icons[id], -14, -14, 28, 28);
      g.fillStyle = '#fbbf24';
      g.strokeStyle = '#78350f';
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const r = k % 2 ? 2.4 : 5.5;
        g.lineTo(10 + Math.cos(a) * r, 9.5 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }, ICON_SPR);
  }
  const wIcon = (w) => (w.evolved ? `${w.id}*` : w.id);

  function drawIcon(id, x, y, size) {
    const c = icons[id];
    if (c) ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
  }

  // Ground: a few tile variants picked per cell, plus larger props.
  const TILE = 256;
  const hash = (x, y, s = 0) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function makeTile(mapId, v, scale = SPR) {
    const pal = MAPS[mapId].ground;
    return makeCanvas(TILE, TILE, (g) => {
      g.translate(-TILE / 2, -TILE / 2);
      g.fillStyle = pal.base;
      g.fillRect(0, 0, TILE, TILE);
      let n = 0;
      const r = () => hash(v, n++, 7 + MAP_ORDER.indexOf(mapId) * 13);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = r() < 0.5 ? pal.light : pal.dark;
        g.beginPath();
        g.ellipse(20 + r() * (TILE - 40), 20 + r() * (TILE - 40), 14 + r() * 26, 8 + r() * 14, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      if (pal.snow) {
        // Drifts of snow and hairline cracks in the ice.
        for (let k = 0; k < 5; k++) {
          g.fillStyle = 'rgba(226,238,248,0.13)';
          g.beginPath();
          g.ellipse(24 + r() * (TILE - 48), 24 + r() * (TILE - 48), 18 + r() * 30, 7 + r() * 10, r() * 0.6 - 0.3, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(186,230,253,0.28)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          let x = 20 + r() * (TILE - 40);
          let y = 20 + r() * (TILE - 40);
          g.beginPath();
          g.moveTo(x, y);
          for (let j = 0; j < 4; j++) {
            x += (r() - 0.5) * 40;
            y += (r() - 0.5) * 40;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      }
      if (pal.cracks) {
        // Cracks with embers glowing deep inside.
        for (let k = 0; k < 2; k++) {
          let x = 30 + r() * (TILE - 60);
          let y = 30 + r() * (TILE - 60);
          const pts = [[x, y]];
          for (let j = 0; j < 5; j++) {
            x = clamp(x + (r() - 0.5) * 50, 6, TILE - 6);
            y = clamp(y + (r() - 0.5) * 50, 6, TILE - 6);
            pts.push([x, y]);
          }
          for (const [x2, y2] of pts) drawGlow(x2, y2, 14, '#c2410c', g);
          for (const [w, col] of [[4, '#120a08'], [1.6, '#f97316'], [0.6, '#fde68a']]) {
            g.strokeStyle = col;
            g.lineWidth = w;
            g.lineJoin = 'round';
            g.beginPath();
            pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
            g.stroke();
          }
        }
      }
      g.lineCap = 'round';
      for (let k = 0; k < 16; k++) {
        const x = 12 + r() * (TILE - 24);
        const y = 12 + r() * (TILE - 24);
        g.strokeStyle = r() < 0.5 ? pal.grass[0] : pal.grass[1];
        g.lineWidth = 1.6;
        g.beginPath();
        for (let b = -1; b <= 1; b++) {
          g.moveTo(x + b * 2, y);
          g.lineTo(x + b * 4, y - 5 - r() * 4);
        }
        g.stroke();
      }
      for (let k = 0; k < 4; k++) {
        g.fillStyle = pal.stone;
        g.beginPath();
        g.ellipse(12 + r() * (TILE - 24), 12 + r() * (TILE - 24), 3 + r() * 3, 2 + r() * 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (let k = 0; k < 5; k++) {
        const x = 12 + r() * (TILE - 24);
        const y = 12 + r() * (TILE - 24);
        const c = pal.motes[(r() * 3) | 0];
        drawGlow(x, y, 6, c, g);
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, 1.4, 0, Math.PI * 2);
        g.fill();
      }
    }, scale);
  }

  // Tiles and props are drawn the first time a map is shown.
  const tileCache = {};
  const tilesFor = (mapId) => tileCache[mapId] || (tileCache[mapId] = [0, 1, 2, 3].map((v) => makeTile(mapId, v)));

  const shadow = (g, y, rx) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(0, y, rx, rx * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  };

  const PROP_ART = {
    moor: [
      // Gravestone.
      [40, 48, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(0, 18, 16, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4b5563';
        g.beginPath();
        g.roundRect(-11, -16, 22, 34, [11, 11, 2, 2]);
        g.fill();
        g.fillStyle = '#374151';
        g.fillRect(-11, 12, 22, 6);
        g.fillStyle = '#1f2937';
        g.fillRect(-1.5, -9, 3, 14);
        g.fillRect(-5.5, -5, 11, 3);
      }],
      // Dead tree.
      [80, 96, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(0, 42, 26, 7, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2a211c';
        g.lineCap = 'round';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(0, 42);
        g.lineTo(2, -4);
        g.stroke();
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(2, 4);
        g.lineTo(-22, -22);
        g.lineTo(-30, -20);
        g.moveTo(2, -4);
        g.lineTo(18, -30);
        g.lineTo(28, -34);
        g.moveTo(-10, -9);
        g.lineTo(-10, -36);
        g.stroke();
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(18, -30);
        g.lineTo(14, -42);
        g.moveTo(-22, -22);
        g.lineTo(-28, -36);
        g.stroke();
      }],
      // Rock with moss.
      [56, 40, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(0, 12, 24, 6, 0, 0, Math.PI * 2);
        g.fill();
        blob(g, [[-22, 12], [-18, -6], [-4, -14], [12, -10], [22, 2], [20, 12]], '#475055');
        blob(g, [[-18, -6], [-4, -14], [12, -10], [2, -6], [-10, -4]], '#5b666b');
        g.fillStyle = '#2f5a45';
        g.beginPath();
        g.ellipse(6, -10, 7, 3, 0.2, 0, Math.PI * 2);
        g.fill();
      }],
      // Bones.
      [40, 24, (g) => {
        g.strokeStyle = '#d6d3d1';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-12, -4);
        g.lineTo(10, 4);
        g.moveTo(-10, 6);
        g.lineTo(8, -6);
        g.stroke();
        g.fillStyle = '#e7e5e4';
        g.beginPath();
        g.arc(14, -2, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#292524';
        g.fillRect(12, -3, 2, 2);
        g.fillRect(15.5, -3, 2, 2);
      }],
      // Mushrooms.
      [36, 28, (g) => {
        for (const [x, y, s] of [[-6, 4, 1], [6, 6, 0.75], [0, -2, 0.6]]) {
          g.fillStyle = '#e7e5e4';
          g.fillRect(x - 1.5 * s, y, 3 * s, 7 * s);
          drawGlow(x, y, 10 * s, '#67e8f9', g);
          g.fillStyle = '#22d3ee';
          g.beginPath();
          g.ellipse(x, y, 7 * s, 5 * s, 0, Math.PI, 0);
          g.fill();
        }
      }],
    ],
    fen: [
      // Ice crystals.
      [48, 56, (g) => {
        shadow(g, 22, 18);
        drawGlow(0, 0, 26, '#7dd3fc', g);
        for (const [x, h, w, a, c] of [[-9, 30, 6, -0.3, '#7dd3fc'], [0, 44, 8, 0, '#e0f2fe'], [10, 26, 6, 0.35, '#bae6fd']]) {
          g.save();
          g.translate(x, 22);
          g.rotate(a);
          blob(g, [[-w, 0], [-w * 0.8, -h * 0.75], [0, -h], [w * 0.8, -h * 0.75], [w, 0]], c);
          blob(g, [[0, -h], [w * 0.8, -h * 0.75], [w, 0], [0, 0]], 'rgba(14,116,144,0.35)');
          g.restore();
        }
      }],
      // Frozen reeds.
      [40, 44, (g) => {
        g.strokeStyle = '#94a3b8';
        g.lineCap = 'round';
        g.lineWidth = 1.8;
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const x = -12 + k * 4;
          g.moveTo(x, 18);
          g.quadraticCurveTo(x + 2, 0, x + (k % 2 ? 6 : -4), -16 + (k % 3) * 5);
        }
        g.stroke();
        g.fillStyle = '#e2e8f0';
        g.beginPath();
        g.ellipse(0, 18, 15, 3, 0, 0, Math.PI * 2);
        g.fill();
      }],
      // Snowy rock.
      [56, 42, (g) => {
        shadow(g, 13, 24);
        blob(g, [[-22, 13], [-18, -6], [-4, -14], [12, -10], [22, 2], [20, 13]], '#3f4c57');
        blob(g, [[-18, -5], [-4, -14], [12, -10], [18, -2], [6, -6], [-8, -3]], '#f1f5f9');
      }],
      // Dead birch.
      [70, 100, (g) => {
        shadow(g, 44, 22);
        g.strokeStyle = '#cbd5e1';
        g.lineCap = 'round';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(0, 44);
        g.lineTo(-2, -20);
        g.stroke();
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(-1, 0);
        g.lineTo(18, -26);
        g.moveTo(-2, -12);
        g.lineTo(-20, -36);
        g.moveTo(-2, -20);
        g.lineTo(2, -46);
        g.stroke();
        g.fillStyle = '#1e293b';
        for (const [x, y] of [[-3, 30], [1, 16], [-4, 4], [0, -10]]) g.fillRect(x, y, 4, 2);
        g.fillStyle = '#f8fafc';
        g.beginPath();
        g.ellipse(16, -27, 5, 2, -0.9, 0, Math.PI * 2);
        g.ellipse(-19, -36, 5, 2, 0.9, 0, Math.PI * 2);
        g.fill();
      }],
      // Frozen pond.
      [110, 56, (g) => {
        g.fillStyle = '#1e3a4c';
        g.beginPath();
        g.ellipse(0, 0, 52, 24, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(186,230,253,0.35)';
        g.beginPath();
        g.ellipse(-4, -2, 44, 18, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(240,249,255,0.6)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-26, -8);
        g.lineTo(-8, -12);
        g.moveTo(8, 6);
        g.lineTo(28, 2);
        g.stroke();
      }],
    ],
    ruins: [
      // Broken pillar.
      [44, 76, (g) => {
        shadow(g, 32, 18);
        g.fillStyle = '#57534e';
        g.fillRect(-11, -18, 22, 50);
        g.fillStyle = '#78716c';
        g.fillRect(-11, -18, 6, 50);
        g.fillStyle = '#44403c';
        g.fillRect(-15, 26, 30, 8);
        blob(g, [[-11, -18], [-6, -28], [0, -22], [5, -33], [11, -20], [11, -18]], '#57534e');
        g.strokeStyle = '#292524';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-2, -16);
        g.lineTo(2, 30);
        g.moveTo(5, -12);
        g.lineTo(7, 28);
        g.stroke();
      }],
      // Ruined wall.
      [96, 60, (g) => {
        shadow(g, 22, 44);
        g.fillStyle = '#44403c';
        for (let row = 0; row < 4; row++) {
          const w = [86, 70, 52, 30][row];
          for (let x = -43; x < -43 + w; x += 18) {
            g.fillStyle = (row + x) % 3 ? '#57534e' : '#4b4542';
            g.fillRect(x + (row % 2) * 8, 14 - row * 11, 16, 10);
          }
        }
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(-43, 22, 86, 3);
      }],
      // Pile of skulls.
      [44, 32, (g) => {
        for (const [x, y] of [[-9, 6], [6, 7], [-2, -3]]) {
          g.fillStyle = '#d6d3d1';
          g.beginPath();
          g.arc(x, y, 6.5, 0, Math.PI * 2);
          g.fill();
          g.fillRect(x - 3.5, y + 3, 7, 4);
          g.fillStyle = '#1c1917';
          g.fillRect(x - 3.5, y - 1, 2.5, 2.5);
          g.fillRect(x + 1, y - 1, 2.5, 2.5);
        }
      }],
      // Ember vent.
      [60, 40, (g) => {
        drawGlow(0, 0, 30, '#ea580c', g);
        g.fillStyle = '#0c0a09';
        g.beginPath();
        g.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f97316';
        g.beginPath();
        g.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fde68a';
        g.beginPath();
        g.ellipse(0, 0, 6, 2.2, 0, 0, Math.PI * 2);
        g.fill();
      }],
      // Charred stump.
      [44, 40, (g) => {
        shadow(g, 14, 18);
        g.fillStyle = '#1c1917';
        g.beginPath();
        g.moveTo(-12, 14);
        g.lineTo(-9, -8);
        g.lineTo(-3, -4);
        g.lineTo(1, -12);
        g.lineTo(6, -5);
        g.lineTo(10, -9);
        g.lineTo(12, 14);
        g.closePath();
        g.fill();
        g.strokeStyle = '#ea580c';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(-4, 10);
        g.lineTo(-1, 0);
        g.lineTo(3, 6);
        g.stroke();
      }],
    ],
  };
  const propCache = {};
  const propsFor = (mapId) => propCache[mapId] || (propCache[mapId] = PROP_ART[mapId].map(([w, h, draw]) => ({ w, h, img: makeCanvas(w, h, draw) })));

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function gemColor(v) {
    if (v < 2) return '#60a5fa';
    if (v < 10) return '#34d399';
    if (v < 40) return '#f87171';
    return '#fbbf24';
  }

  // Jagged lightning path between two points, stable for a given seed.
  function jag(x1, y1, x2, y2, seed, parts) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < parts; i++) {
      const k = i / parts;
      const off = (hash(i, (seed * 1e6) | 0) - 0.5) * 26;
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const nl = Math.hypot(nx, ny) || 1;
      ctx.lineTo(x1 + (x2 - x1) * k + (nx / nl) * off, y1 + (y2 - y1) * k + (ny / nl) * off);
    }
    ctx.lineTo(x2, y2);
  }

  // 0 → 1 → 0 over a boss intro: ease toward the boss, hold, ease back.
  function cineK(c) {
    const ease = (k) => k * k * (3 - 2 * k);
    if (c.t < 0.7) return ease(c.t / 0.7);
    if (c.t > c.dur - 0.6) return ease(Math.max(0, (c.dur - c.t) / 0.6));
    return 1;
  }

  const view = { x: 0, y: 0, hw: W / 2, hh: H / 2 };
  const inView = (o, m = 0) => Math.abs(o.x - view.x) < view.hw + m && Math.abs(o.y - view.y) < view.hh + m;

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) {
      ctx.fillStyle = '#0b1210';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const p = state.p;
    const now = performance.now() / 1000;
    const map = MAPS[state.map];

    // Camera: follows you, pans to a boss during its intro, kicks on big kills.
    let cx = p.x;
    let cy = p.y;
    let zoom = 1 + (state.kick || 0) * 0.06;
    if (state.cine) {
      const k = cineK(state.cine);
      cx += (state.cine.x - p.x) * k;
      cy += (state.cine.y - p.y) * k;
      zoom += 0.28 * k;
    }
    const sh = setting('shake') ? state.shake : 0;
    if (sh) {
      cx += rand(-1, 1) * sh;
      cy += rand(-1, 1) * sh;
    }
    view.x = cx;
    view.y = cy;
    view.hw = W / 2 / zoom;
    view.hh = H / 2 / zoom;
    const camX = cx - view.hw;
    const camY = cy - view.hh;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    drawGround(camX, camY);

    // Fire pools.
    for (const pl of state.pools) {
      const a = Math.min(1, pl.life / 0.4, (pl.max - pl.life) / 0.15 + 0.3);
      ctx.globalAlpha = a;
      drawGlow(pl.x, pl.y, pl.r * 1.5, pl.evo ? '#ef4444' : '#f97316');
      ctx.fillStyle = pl.evo ? 'rgba(220,38,38,0.35)' : 'rgba(234,88,12,0.3)';
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y, pl.r, pl.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const n = Math.max(4, Math.round(pl.r / 7));
      for (let k = 0; k < n; k++) {
        const fx = pl.x + (hash(k, 1, pl.seed | 0) - 0.5) * pl.r * 1.5;
        const fy = pl.y + (hash(k, 2, pl.seed | 0) - 0.5) * pl.r;
        const h = 8 + Math.sin(now * 12 + k * 1.7) * 3;
        ctx.fillStyle = k % 2 ? '#fdba74' : '#fb923c';
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy);
        ctx.quadraticCurveTo(fx, fy - h * 1.6, fx + 4, fy);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    drawHazards();

    // Aura.
    const aura = state.weapons.find((w) => w.id === 'aura');
    if (aura) {
      const R = 72 * aura.s.area;
      ctx.fillStyle = aura.evolved ? 'rgba(254,240,138,0.1)' : 'rgba(251,191,36,0.07)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = aura.evolved ? 'rgba(254,240,138,0.55)' : 'rgba(251,191,36,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -aura.phase * 30;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Gems and pickups.
    for (const g of state.gems) {
      if (!inView(g, 20)) continue;
      const c = gemColor(g.v);
      const r = 4 + Math.min(5, Math.log2(g.v + 1));
      drawGlow(g.x, g.y, r * 2.2, c);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - r * 1.3);
      ctx.lineTo(g.x + r, g.y);
      ctx.lineTo(g.x, g.y + r * 1.3);
      ctx.lineTo(g.x - r, g.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(g.x - 1, g.y - r * 0.8, 2, r * 0.7);
    }
    for (const it of state.pickups) {
      if (!inView(it, 40)) continue;
      const bob = Math.sin(now * 3 + it.x) * 2;
      if (it.kind === 'chest') {
        // Chests pulse and shed light rays so they read from across the screen.
        const ready = state.weapons.some(canEvolve);
        drawRays(it.x, it.y - 4, 70, now * 0.6, ready ? 'rgba(253,224,71,0.22)' : 'rgba(251,191,36,0.13)', 8);
        drawGlow(it.x, it.y, 40 + Math.sin(now * 4) * 5, '#fbbf24');
        drawIcon('chest', it.x, it.y - 4 + bob, 40);
      } else {
        drawIcon(it.kind, it.x, it.y + bob, it.kind === 'coin' ? 16 : 22);
      }
    }

    // Shadows, then enemies and the player sorted by height.
    const vis = [];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    for (const e of state.foes) {
      if (!inView(e, 90)) continue;
      vis.push(e);
      if (FOES[e.type].fly && !e.prop) continue;
      ctx.moveTo(e.x + e.r, e.y + e.r * 0.85);
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r, e.r * 0.35, 0, 0, Math.PI * 2);
    }
    ctx.moveTo(p.x + 11, p.y + 14);
    ctx.ellipse(p.x, p.y + 14, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    vis.push(p);
    vis.sort((a, b) => a.y - b.y);
    for (const e of vis) {
      if (e === p) drawPlayer(now);
      else drawFoe(e, now);
    }

    // Player weapons.
    for (const b of state.shots) drawShot(b);
    for (const w of state.weapons) {
      if (w.id !== 'orbit' || (!w.evolved && w.active <= 0)) continue;
      const r = 11 * Math.sqrt(w.s.area);
      for (const sh of orbitShards(w)) {
        drawGlow(sh.x, sh.y, r * 2.4, w.evolved ? '#fef3c7' : '#fde68a');
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.a + Math.PI);
        ctx.drawImage(icons.orbit, -r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
        ctx.restore();
      }
    }

    // Enemy shots.
    for (const b of state.eshots) {
      drawGlow(b.x, b.y, 14, b.color);
      ctx.fillStyle = '#fdf2f8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    drawEffects();
    ctx.restore();

    // Moonlit fog around the edges, tinted per map.
    const px = (p.x - cx) * zoom + W / 2;
    const py = (p.y - cy) * zoom + H / 2;
    const [fr, fg, fb] = map.fog;
    const fog = ctx.createRadialGradient(px, py, 170, px, py, 640);
    fog.addColorStop(0, `rgba(${fr},${fg},${fb},0)`);
    fog.addColorStop(1, `rgba(${fr},${fg},${fb},0.62)`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);
    drawWeather(map.weather, camX, camY, now);
    if (p.hurtT > 0) {
      ctx.fillStyle = `rgba(220,38,38,${p.hurtT * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawLowHealth(now);
    if (state.slowmo) drawSlowmo(px, py, now);

    if (state.cine) drawCine();
    else drawHud(now);
    if (state.mode === 'levelup') drawLevelUp();
    if (state.mode === 'chest') drawChest(now);
    if (state.banner && state.mode === 'playing' && !state.cine) drawBanner();
    if (state.tut && state.mode === 'playing' && !state.cine) drawTutorial(now);
    if (input.stick && state.mode === 'playing') drawStick();
  }

  // Rotating light rays around a point.
  function drawRays(x, y, r, a0, color, n = 12) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const w = Math.PI / n / 1.6;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - w) * r, y + Math.sin(a - w) * r);
      ctx.lineTo(x + Math.cos(a + w) * r, y + Math.sin(a + w) * r);
      ctx.closePath();
    }
    ctx.fill();
  }

  function drawHazards() {
    for (const h of state.hazards) {
      const ice = h.kind === 'ice';
      if (!h.done) {
        // A warning ring that fills in as the strike gets close.
        const k = Math.min(1, h.t / h.delay);
        ctx.fillStyle = ice ? 'rgba(125,211,252,0.12)' : 'rgba(249,115,22,0.14)';
        ctx.beginPath();
        ctx.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ice ? 'rgba(186,230,253,0.28)' : 'rgba(251,146,60,0.32)';
        ctx.beginPath();
        ctx.ellipse(h.x, h.y, h.r * k, h.r * 0.7 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ice ? '#bae6fd' : '#fb923c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (ice && k > 0.5) {
          // The icicle falling from above.
          const y = h.y - (1 - k) * 2 * 260;
          ctx.globalAlpha = (k - 0.5) * 2;
          drawGlow(h.x, y - 10, 18, '#7dd3fc');
          ctx.fillStyle = '#e0f2fe';
          ctx.beginPath();
          ctx.moveTo(h.x - 6, y - 34);
          ctx.lineTo(h.x + 6, y - 34);
          ctx.lineTo(h.x, y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        const k = (h.t - h.delay) / 0.4;
        ctx.globalAlpha = 1 - k;
        drawGlow(h.x, h.y - 10, h.r * 1.8, ice ? '#7dd3fc' : '#f97316');
        if (ice) {
          ctx.fillStyle = '#e0f2fe';
          for (let j = -2; j <= 2; j++) {
            const hh = (26 - Math.abs(j) * 7) * (1 + k * 0.3);
            ctx.beginPath();
            ctx.moveTo(h.x + j * 9 - 5, h.y);
            ctx.lineTo(h.x + j * 11, h.y - hh);
            ctx.lineTo(h.x + j * 9 + 5, h.y);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#fdba74';
          ctx.beginPath();
          ctx.moveTo(h.x - h.r * 0.5, h.y);
          ctx.quadraticCurveTo(h.x, h.y - 90 * (1 - k * 0.5), h.x + h.r * 0.5, h.y);
          ctx.fill();
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath();
          ctx.moveTo(h.x - h.r * 0.25, h.y);
          ctx.quadraticCurveTo(h.x, h.y - 55 * (1 - k * 0.5), h.x + h.r * 0.25, h.y);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // Screen-space weather that drifts with the camera for a sense of depth.
  function drawWeather(kind, camX, camY, now) {
    if (kind === 'snow') {
      ctx.fillStyle = 'rgba(241,245,249,0.75)';
      for (let k = 0; k < 70; k++) {
        const sp = 20 + hash(k, 1, 9) * 30;
        const x = (((hash(k, 2, 9) * 1300 - camX * 0.3 + Math.sin(now * 0.8 + k) * 18) % 1100) + 1100) % 1100 - 50;
        const y = (((hash(k, 3, 9) * 700 + now * sp - camY * 0.3) % 640) + 640) % 640 - 40;
        const r = 0.8 + hash(k, 4, 9) * 1.6;
        ctx.globalAlpha = 0.4 + hash(k, 5, 9) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'embers') {
      for (let k = 0; k < 40; k++) {
        const sp = 18 + hash(k, 1, 8) * 30;
        const x = (((hash(k, 2, 8) * 1300 - camX * 0.25 + Math.sin(now * 1.3 + k) * 22) % 1100) + 1100) % 1100 - 50;
        const y = (((hash(k, 3, 8) * 700 - now * sp - camY * 0.25) % 640) + 640) % 640 - 40;
        ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(now * 3 + k));
        ctx.fillStyle = k % 3 ? '#fb923c' : '#fde68a';
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'fireflies') {
      for (let k = 0; k < 14; k++) {
        const x = (((hash(k, 2, 6) * 1300 - camX * 0.15 + Math.sin(now * 0.5 + k * 2) * 40) % 1100) + 1100) % 1100 - 50;
        const y = (((hash(k, 3, 6) * 700 - camY * 0.15 + Math.cos(now * 0.4 + k) * 30) % 640) + 640) % 640 - 40;
        ctx.globalAlpha = 0.25 + 0.35 * Math.max(0, Math.sin(now * 1.7 + k * 1.3));
        drawGlow(x, y, 7, '#d9f99d');
      }
      ctx.globalAlpha = 1;
    }
  }

  // A pulsing red edge (and a heartbeat) when health runs low.
  function drawLowHealth(now) {
    const p = state.p;
    const k = p.hp / p.maxHp;
    if (k >= 0.3 || p.hp <= 0 || state.mode === 'menu') return;
    const beat = Math.pow(Math.max(0, Math.sin(now * (k < 0.15 ? 9 : 7))), 6);
    const a = (0.3 - k) / 0.3 * 0.45 + beat * 0.18;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(127,29,29,0)');
    g.addColorStop(1, `rgba(185,28,28,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // The world darkens and light gathers on you before an evolution.
  function drawSlowmo(px, py, now) {
    const k = Math.min(1, state.slowmo.t / SLOWMO);
    ctx.fillStyle = `rgba(2,3,10,${k * 0.7})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    drawRays(px, py - 6, 120 + k * 500, now * 0.8, 'rgba(253,230,138,0.16)', 14);
    drawGlow(px, py - 6, 40 + k * 90, '#fde68a');
    ctx.globalAlpha = 1;
  }

  // Boss intro: letterbox bars and a name card.
  function drawCine() {
    const c = state.cine;
    const k = cineK(c);
    const bar = 64 * Math.min(1, c.t / 0.35, (c.dur - c.t) / 0.35);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    const in1 = clamp((c.t - 0.55) / 0.35, 0, 1);
    if (in1 <= 0) return;
    const out = clamp((c.dur - c.t) / 0.4, 0, 1);
    ctx.globalAlpha = Math.min(in1, out) * k;
    const slide = (1 - in1) ** 3 * 160;
    const y = H - 128;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, 'rgba(0,0,0,0.65)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.65)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 52, W, 80);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(c.sub.toUpperCase().split('').join(' '), W / 2 - slide, y - 28);
    ctx.font = 'bold 44px Georgia, serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(c.name, W / 2 + slide, y + 14);
    ctx.fillStyle = '#f5d0fe';
    ctx.fillText(c.name, W / 2 + slide, y + 14);
    ctx.globalAlpha = 1;
  }

  function drawGround(camX, camY) {
    const tiles = tilesFor(state.map);
    const props = propsFor(state.map);
    const x0 = Math.floor(camX / TILE);
    const y0 = Math.floor(camY / TILE);
    for (let cx = x0; cx <= x0 + Math.ceil(W / TILE) + 1; cx++) {
      for (let cy = y0; cy <= y0 + Math.ceil(H / TILE) + 1; cy++) {
        ctx.drawImage(tiles[(hash(cx, cy, 1) * tiles.length) | 0], cx * TILE, cy * TILE, TILE + 0.6, TILE + 0.6);
      }
    }
    const PC = 300;
    const px0 = Math.floor((camX - 60) / PC);
    const py0 = Math.floor((camY - 60) / PC);
    for (let cx = px0; cx <= px0 + Math.ceil(W / PC) + 1; cx++) {
      for (let cy = py0; cy <= py0 + Math.ceil(H / PC) + 1; cy++) {
        if (hash(cx, cy, 3) > 0.6) continue;
        const pr = props[(hash(cx, cy, 4) * props.length) | 0];
        const x = cx * PC + 40 + hash(cx, cy, 5) * (PC - 80);
        const y = cy * PC + 40 + hash(cx, cy, 6) * (PC - 80);
        ctx.drawImage(pr.img, x - pr.w / 2, y - pr.h / 2, pr.w, pr.h);
      }
    }
  }

  function drawFoe(e, now) {
    const sp = sprites[e.type];
    const sc = e.elite ? 1.6 : 1;
    const dir = e.faceX > 0 ? 0 : 1;
    let bob = e.prop || e.boss ? 0 : Math.sin(e.bob) * 1.5;
    if (FOES[e.type].fly) bob = Math.sin(e.bob * 0.8) * 3;
    if (e.elite) drawGlow(e.x, e.y, e.r * 2.2, '#fbbf24');
    if (e.wind > 0) drawGlow(e.x, e.y, e.r * 2.5, '#ef4444');
    const img = e.flash > 0 ? sp.flash[dir] : sp.img[dir];
    let w = sp.w * sc;
    let h = sp.h * sc;
    if (e.type === 'moth') h *= 0.75 + Math.abs(Math.sin(e.bob * 2.5)) * 0.35;
    ctx.drawImage(img, e.x - w / 2, e.y - h / 2 + bob, w, h);
    if (e.prop) {
      const fl = Math.sin(now * 14 + e.id) * 2;
      drawGlow(e.x, e.y - 12, 26, '#fb923c');
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(e.x - 8, e.y - 5);
      ctx.quadraticCurveTo(e.x - 2, e.y - 26 - fl, e.x + 8, e.y - 5);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(e.x - 4, e.y - 5);
      ctx.quadraticCurveTo(e.x, e.y - 16 + fl, e.x + 4, e.y - 5);
      ctx.fill();
    }
    if ((e.elite || (e.hp < e.maxHp && !e.boss && e.maxHp > 60)) && !e.prop) {
      const bw = Math.max(20, e.r * 1.6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - bw / 2, e.y - h / 2 - 6, bw, 3);
      ctx.fillStyle = e.elite ? '#fbbf24' : '#f87171';
      ctx.fillRect(e.x - bw / 2, e.y - h / 2 - 6, bw * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  function drawPlayer(now) {
    const p = state.p;
    if (p.iframe > 0 && Math.floor(now * 12) % 2) return;
    const frame = p.moving ? Math.floor(p.walk / 1.6) % 4 : 0;
    const sp = heroSprite(state.char, frame);
    const dir = p.faceX > 0 ? 0 : 1;
    const bob = p.moving ? Math.abs(Math.sin(p.walk / 1.6 * (Math.PI / 2))) * -1.5 : Math.sin(now * 2) * 0.8;
    drawGlow(p.x, p.y - 4, 60, CHARS[state.char].trim);
    ctx.drawImage(p.hurtT > 0 ? sp.flash[dir] : sp.img[dir], p.x - sp.w / 2, p.y - sp.h / 2 - 2 + bob, sp.w, sp.h);
    if (p.chill > 0) {
      // Frosted over: a cold glow and drifting ice motes.
      ctx.globalAlpha = Math.min(1, p.chill) * 0.8;
      drawGlow(p.x, p.y - 2, 26, '#7dd3fc');
      ctx.fillStyle = '#e0f2fe';
      for (let k = 0; k < 4; k++) {
        const a = now * 2 + k * 1.6;
        ctx.fillRect(p.x + Math.cos(a) * 14 - 1, p.y - 4 + Math.sin(a * 1.3) * 12 - 1, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
    }
    const k = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - 16, p.y + 20, 32, 4);
    ctx.fillStyle = k > 0.35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(p.x - 16, p.y + 20, 32 * k, 4);
  }

  function drawShot(b) {
    if (b.kind === 'bolt') {
      drawGlow(b.x, b.y, b.r * 3.2, '#a855f7');
      ctx.fillStyle = '#f3e8ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === 'star') {
      drawGlow(b.x, b.y, b.r * 3.2, '#fde68a');
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.life * 10);
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? b.r * 0.4 : b.r * 1.3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (b.kind === 'dagger') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-3, -2.5);
      ctx.lineTo(-3, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a16207';
      ctx.fillRect(-5, -3.5, 2, 7);
      ctx.fillStyle = '#57301a';
      ctx.fillRect(-10, -1.2, 5, 2.4);
      ctx.restore();
    } else if (b.kind === 'axe') {
      const s = b.r / 13;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(s, s);
      ctx.fillStyle = '#6b4f2a';
      ctx.fillRect(-2, -4, 4, 20);
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(-2, -16);
      ctx.lineTo(14, -16);
      ctx.quadraticCurveTo(17, -4, 12, 3);
      ctx.lineTo(-2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(10, -15, 3, 16);
      ctx.restore();
    } else if (b.kind === 'flask') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.drawImage(icons.flask, -9, -9, 18, 18);
      ctx.restore();
    } else if (b.kind === 'glaive') {
      const r = b.r * 1.25;
      drawGlow(b.x, b.y, r * 2, b.evo ? '#fde68a' : '#67e8f9');
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.drawImage(icons.glaive, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const f of state.fx) {
      const k = f.t / f.life;
      if (f.kind === 'slash') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        const x = f.x;
        const y = f.y;
        const rx = f.len / 2;
        const ry = f.hh * (0.8 + k * 0.4);
        ctx.fillStyle = f.evo ? '#fda4af' : '#e2e8f0';
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0);
        ctx.ellipse(x, y + ry * 0.4, rx * 0.94, ry * 0.65, 0, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = (1 - k) * 0.4;
        ctx.fillStyle = f.evo ? '#e11d48' : '#7dd3fc';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, rx * 1.02, ry * 1.1, 0, Math.PI, 0);
        ctx.ellipse(x, y + ry * 0.5, rx * 0.9, ry * 0.6, 0, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (f.kind === 'strike') {
        ctx.globalAlpha = 1 - k;
        drawGlow(f.x, f.y, f.r * 2.2, '#7dd3fc');
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 3;
        jag(f.x + (f.seed - 0.5) * 60, f.y - 420, f.x, f.y, f.seed, 9);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(125,211,252,0.5)';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'chain') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2.5;
        jag(f.x, f.y, f.x2, f.y2, f.seed, 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'nova') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#f5f3ff';
        ctx.lineWidth = 24 * (1 - k) + 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 40 + k * 620, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'pop') {
        // A quick ring where something died.
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.35 + Math.sqrt(k) * 0.65), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'flash') {
        ctx.globalAlpha = (1 - k) * 0.9;
        drawGlow(f.x, f.y, f.r * (0.5 + k), '#ffffff');
        ctx.globalAlpha = 1;
      } else if (f.kind === 'lvl') {
        // Level up: a golden ring rises out of you.
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + 12 - k * 20, 20 + k * 70, (20 + k * 70) * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawGlow(f.x, f.y - 4, 50 + k * 40, '#fde68a');
        ctx.globalAlpha = 1;
      } else if (f.kind === 'spike') {
        // A bone spike shoots up, then sinks back into the earth.
        const up = Math.min(1, f.t / 0.07);
        const down = clamp((f.t - 0.25) / 0.2, 0, 1);
        const h = 30 * f.s * (up < 1 ? up * (2 - up) : 1) * (1 - down);
        const w = 7 * f.s;
        ctx.globalAlpha = 1 - down * 0.6;
        ctx.fillStyle = 'rgba(28,25,23,0.6)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, w * 1.8, w * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        const lean = f.flip ? 3 : -3;
        ctx.fillStyle = '#e7e5e4';
        ctx.beginPath();
        ctx.moveTo(f.x - w, f.y);
        ctx.lineTo(f.x + lean, f.y - h);
        ctx.lineTo(f.x + w, f.y);
        ctx.fill();
        ctx.fillStyle = '#a8a29e';
        ctx.beginPath();
        ctx.moveTo(f.x + lean, f.y - h);
        ctx.lineTo(f.x + w, f.y);
        ctx.lineTo(f.x + 1, f.y);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Glowing motes first, then every particle batched by colour and fade
    // step into as few fills as possible.
    for (const q of state.parts) {
      if (!q.glow) continue;
      ctx.globalAlpha = Math.min(1, q.life / 0.3);
      drawGlow(q.x, q.y, q.size * 3.5, q.color);
    }
    let key = '';
    for (const q of state.parts) {
      const a = Math.ceil(Math.min(1, q.life / 0.3) * 4) / 4;
      const k = q.color + a;
      if (k !== key) {
        if (key) ctx.fill();
        key = k;
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.beginPath();
      }
      const sp = Math.abs(q.vx) + Math.abs(q.vy);
      if (sp > 90 && !q.float) {
        // Fast sparks stretch along their path.
        const len = Math.hypot(q.vx, q.vy) || 1;
        const nx = (-q.vy / len) * q.size * 0.45;
        const ny = (q.vx / len) * q.size * 0.45;
        const tx = q.x - q.vx * 0.03;
        const ty = q.y - q.vy * 0.03;
        ctx.moveTo(tx + nx, ty + ny);
        ctx.lineTo(q.x + nx, q.y + ny);
        ctx.lineTo(q.x - nx, q.y - ny);
        ctx.lineTo(tx - nx, ty - ny);
        ctx.closePath();
      } else ctx.rect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    if (key) ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    let font = '';
    for (const t of state.texts) {
      // Numbers pop in large, settle, then fade.
      const age = t.max - t.life;
      const pop = 1 + 0.7 * Math.max(0, 1 - age / 0.12);
      const size = Math.round(t.size * pop);
      const f = `800 ${size}px system-ui, sans-serif`;
      if (f !== font) {
        font = f;
        ctx.font = f;
        ctx.lineWidth = size > 14 ? 4 : 3;
      }
      ctx.globalAlpha = Math.min(1, t.life / 0.25);
      ctx.fillStyle = t.color || '#fff';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  const SYS = { x0: W - 120, y: 22, size: 32, gap: 6 };

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  function levelCards() {
    const n = state.choices.length;
    const cw = 250;
    const gap = 22;
    const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
    return state.choices.map((o, k) => ({ id: `card:${k}`, k, o, x: x0 + k * (cw + gap), y: 116, w: cw, h: 292 }));
  }

  function levelButtons() {
    return [
      { id: 'reroll', label: `Reroll (${state.rerolls})`, x: W / 2 - 170, y: 422, w: 160, h: 40, off: state.rerolls <= 0 },
      { id: 'skip', label: 'Skip', x: W / 2 + 10, y: 422, w: 160, h: 40 },
    ];
  }

  const tutButton = () => ({ id: 'tutskip', label: 'Skip', x: W / 2 + 206, y: H - 104, w: 64, h: 30 });

  const chestButton = () => ({ id: 'collect', label: 'Collect', x: W / 2 - 90, y: 442, w: 180, h: 42 });

  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (state.mode === 'levelup') {
      for (const c of levelCards()) if (inside(c, x, y)) return c;
      for (const b of levelButtons()) if (inside(b, x, y) && !b.off) return b;
    }
    if (state.mode === 'chest' && inside(chestButton(), x, y)) return chestButton();
    if (state.mode === 'playing' && state.tut && !state.cine && inside(tutButton(), x, y)) return tutButton();
    return null;
  }

  function button(b, hover, primary) {
    roundRect(b.x, b.y, b.w, b.h, 9);
    ctx.fillStyle = b.off ? 'rgba(255,255,255,0.08)' : primary ? (hover ? '#8b5cf6' : '#7c3aed') : hover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.fillStyle = b.off ? 'rgba(255,255,255,0.35)' : '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawHud(now) {
    const hover = input.over ? hitTest(input.mx, input.my) : null;

    // Experience bar: it shimmers as gems come in and blazes on a level up.
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, W, 14);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(1, '#a78bfa');
    ctx.fillStyle = g;
    const xw = W * Math.min(1, state.xp / state.xpNeed);
    ctx.fillRect(0, 0, xw, 14);
    if (state.xpPulse > 0) {
      ctx.globalAlpha = state.xpPulse * 3;
      drawGlow(xw, 7, 22, '#e0f2fe');
      ctx.globalAlpha = 1;
    }
    if (state.lvlFlash > 0) {
      const f = state.lvlFlash;
      ctx.fillStyle = `rgba(254,240,138,${f * 0.85})`;
      ctx.fillRect(0, 0, W, 14);
      const gl = ctx.createLinearGradient(0, 14, 0, 14 + 30 * f);
      gl.addColorStop(0, `rgba(253,224,71,${f * 0.5})`);
      gl.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, 14, W, 30 * f);
      // A bright sweep runs along the bar.
      const sx = (1 - f) * W * 1.2;
      drawGlow(sx, 7, 60, '#ffffff');
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`LV ${state.level}`, W - 8, 11);

    // Timer.
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const tt = formatTime(state.won && state.winTime ? state.winTime : state.t);
    ctx.strokeText(tt, W / 2, 44);
    ctx.fillStyle = state.final ? '#f0abfc' : '#fff';
    ctx.fillText(tt, W / 2, 44);

    // Weapon and passive slots.
    for (let i = 0; i < MAX_SLOTS; i++) {
      const w = state.weapons[i];
      const x = 10 + i * 36;
      const y = 22;
      roundRect(x, y, 32, 32, 6);
      ctx.fillStyle = 'rgba(8,12,24,0.72)';
      ctx.fill();
      const ready = w && canEvolve(w);
      if (ready) {
        // Pulses gold when this weapon is ready to evolve.
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 6);
        drawGlow(x + 16, y + 16, 30, '#fde047');
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = w && (w.evolved || ready) ? '#fbbf24' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = w && (w.evolved || ready) ? 2 : 1;
      ctx.stroke();
      if (!w) continue;
      drawIcon(wIcon(w), x + 16, y + 16, 26);
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = w.evolved ? '#fbbf24' : '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      const lv = w.evolved ? '★' : String(w.level);
      ctx.strokeText(lv, x + 30, y + 30);
      ctx.fillText(lv, x + 30, y + 30);
    }
    for (let i = 0; i < MAX_SLOTS; i++) {
      const ps = state.passives[i];
      const x = 10 + i * 36;
      const y = 58;
      roundRect(x + 3, y, 26, 26, 5);
      ctx.fillStyle = 'rgba(8,12,24,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!ps) continue;
      drawIcon(ps.id, x + 16, y + 13, 20);
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(String(ps.level), x + 28, y + 25);
      ctx.fillText(String(ps.level), x + 28, y + 25);
    }

    // Evolution hint.
    const evoW = state.weapons.find(canEvolve);
    if (evoW) {
      const text = `★ ${WEAPONS[evoW.id].name} can evolve: open a chest`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = ctx.measureText(text).width + 22;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now * 4);
      roundRect(10, 90, tw, 22, 11);
      ctx.fillStyle = 'rgba(66,32,6,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'left';
      ctx.fillText(text, 21, 105);
      ctx.globalAlpha = 1;
    }

    // Map and Curse.
    if (state.mode === 'playing' || state.mode === 'paused') {
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillStyle = state.curse ? '#fca5a5' : 'rgba(226,232,240,0.6)';
      ctx.fillText(`${MAPS[state.map].name}${state.curse ? ' · ☠ Cursed' : ''}`.toUpperCase(), W / 2, 62);
    }

    // Kills and gold.
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${state.kills.toLocaleString()} kills`, W - 10, 74);
    ctx.fillStyle = '#fcd34d';
    ctx.fillText(`${Math.floor(state.gold).toLocaleString()}`, W - 10, 94);
    drawIcon('coin', W - 20 - ctx.measureText(`${Math.floor(state.gold).toLocaleString()}`).width, 89, 14);

    // System buttons.
    for (const b of sysButtons()) {
      roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fillStyle = hover && hover.id === b.id ? 'rgba(255,255,255,0.25)' : 'rgba(8,12,24,0.7)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 21);
    }

    // Arrows toward chests that are off screen.
    const p = state.p;
    for (const it of state.pickups) {
      if (it.kind !== 'chest' || onScreen(it, -20)) continue;
      const a = Math.atan2(it.y - p.y, it.x - p.x);
      const ex = clamp(W / 2 + Math.cos(a) * 600, 30, W - 30);
      const ey = clamp(H / 2 + Math.sin(a) * 600, 110, H - 30);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Boss health.
    const boss = state.bossId && state.foes.find((e) => e.id === state.bossId);
    if (boss) {
      const bw = 420;
      const x = W / 2 - bw / 2;
      const y = H - 30;
      ctx.fillStyle = 'rgba(8,12,24,0.8)';
      roundRect(x - 4, y - 22, bw + 8, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#e9d5ff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(FOES[boss.type].name, W / 2, y - 7);
      ctx.fillStyle = '#3b0764';
      ctx.fillRect(x, y, bw, 8);
      ctx.fillStyle = '#c026d3';
      ctx.fillRect(x, y, bw * Math.max(0, boss.hp / boss.maxHp), 8);
    }
  }

  function wrap(text, x, y, width, lineH) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
    return y + lineH;
  }

  const pct = (v) => `${Math.round(v * 100)}%`;
  const int = (v) => String(Math.round(v));
  const W_STATS = [
    ['dmg', 'Damage', int],
    ['cd', 'Cooldown', (v) => `${v.toFixed(2)}s`],
    ['amount', 'Projectiles', int],
    ['pierce', 'Pierce', (v) => (v >= 999 ? '∞' : int(v))],
    ['area', 'Area', pct],
    ['speed', 'Speed', pct],
    ['dur', 'Duration', (v) => `${v.toFixed(1)}s`],
  ];
  const P_STATS = [
    ['might', 'Damage', pct],
    ['cooldown', 'Cooldown', pct],
    ['area', 'Area', pct],
    ['duration', 'Duration', pct],
    ['projSpeed', 'Shot speed', pct],
    ['speed', 'Move speed', int],
    ['maxHp', 'Max health', int],
    ['regen', 'Regen', (v) => `${v.toFixed(2)}/s`],
    ['magnet', 'Pickup range', int],
    ['amount', 'Extra shots', (v) => `+${v}`],
    ['armor', 'Armor', int],
  ];

  // Current → next values for an upgrade card: [label, from, to].
  function statLines(o) {
    const diff = (rows, a, b) => rows
      .map(([k, label, f]) => [label, f(a[k]), f(b[k])])
      .filter(([, x, y]) => x !== y);
    if (o.kind === 'weapon') {
      const next = weaponStats({ id: o.id, level: o.level, evolved: false });
      if (o.level === 1) return [['Damage', null, int(next.dmg)], ['Cooldown', null, `${next.cd.toFixed(2)}s`]];
      return diff(W_STATS, weaponStats({ id: o.id, level: o.level - 1, evolved: false }), next).slice(0, 3);
    }
    if (o.kind === 'passive') {
      const ps = state.passives.map((x) => (x.id === o.id ? { id: x.id, level: x.level + 1 } : x));
      if (!hasPassive(o.id)) ps.push({ id: o.id, level: 1 });
      return diff(P_STATS, baseStats(state.passives), baseStats(ps)).slice(0, 3);
    }
    return [];
  }

  // Footer line on a card about evolutions; `hot` when this pick completes one.
  function evoNote(o) {
    if (o.kind === 'weapon') {
      const pair = WEAPONS[o.id].pair;
      if (o.level === WEAPON_MAX && hasPassive(pair)) return { text: '★ Completes an evolution!', hot: true };
      return { text: `Evolves with ${PASSIVES[pair].name}`, hot: false };
    }
    if (o.kind === 'passive') {
      const owned = state.weapons.filter((w) => !w.evolved && WEAPONS[w.id].pair === o.id);
      if (!owned.length) return null;
      if (o.level === 1 && owned.some((w) => w.level >= WEAPON_MAX)) return { text: '★ Completes an evolution!', hot: true };
      return { text: `Evolves ${owned.map((w) => WEAPONS[w.id].name).join(', ')}`, hot: false };
    }
    return null;
  }

  function optionInfo(o) {
    if (o.kind === 'weapon') {
      const def = WEAPONS[o.id];
      return { icon: o.id, name: def.name, tag: o.level === 1 ? 'New!' : `Level ${o.level}`, desc: def.desc, color: def.color };
    }
    if (o.kind === 'passive') {
      const def = PASSIVES[o.id];
      let desc = def.desc;
      return { icon: o.id, name: def.name, tag: o.level === 1 ? 'New!' : `Level ${o.level}`, desc, color: '#cbd5e1' };
    }
    if (o.kind === 'gold') return { icon: 'coin', name: `${o.v} gold`, tag: '', desc: 'Nothing left to upgrade. Take some gold.', color: '#fcd34d' };
    if (o.kind === 'heal') return { icon: 'vigor', name: 'Heal', tag: '', desc: `Recover ${o.v} health.`, color: '#f87171' };
    if (o.kind === 'evo') {
      const def = WEAPONS[o.id];
      return { icon: `${o.id}*`, name: def.evo.name, tag: 'Evolved!', desc: def.evo.desc, color: '#fbbf24' };
    }
    return { icon: 'coin', name: '', tag: '', desc: '', color: '#fff' };
  }

  function drawLevelUp() {
    ctx.fillStyle = 'rgba(3,6,14,0.72)';
    ctx.fillRect(0, 0, W, H);
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('Level up!', W / 2, 78);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(state.pending > 1 ? `Choose an upgrade (${state.pending} to pick)` : 'Choose an upgrade', W / 2, 100);
    for (const c of levelCards()) {
      const info = optionInfo(c.o);
      const hov = hover && hover.id === c.id;
      // Cards deal in one after another and lift when hovered.
      const kp = clamp((state.choiceT - c.k * 0.06) / 0.2, 0, 1);
      const y = c.y + (1 - kp) * 26 - (hov ? 4 : 0);
      const note = evoNote(c.o);
      ctx.globalAlpha = kp;
      if (note && note.hot) drawGlow(c.x + c.w / 2, y + c.h / 2, c.w * 0.9, '#fbbf24');
      roundRect(c.x, y, c.w, c.h, 14);
      ctx.fillStyle = hov ? '#1e1b3a' : '#131227';
      ctx.fill();
      ctx.strokeStyle = note && note.hot ? '#fbbf24' : hov ? info.color : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = hov || (note && note.hot) ? 2.5 : 1.5;
      ctx.stroke();
      roundRect(c.x + c.w / 2 - 36, y + 18, 72, 72, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      drawIcon(info.icon, c.x + c.w / 2, y + 54, 56);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillText(info.name, c.x + c.w / 2, y + 116);
      if (info.tag) {
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillStyle = info.tag === 'New!' ? '#4ade80' : info.color;
        ctx.fillText(info.tag.toUpperCase(), c.x + c.w / 2, y + 135);
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px system-ui, sans-serif';
      wrap(info.desc, c.x + c.w / 2, y + 158, c.w - 36, 17);
      // Stats: current → next.
      statLines(c.o).forEach(([label, from, to], i) => {
        const ly = y + 205 + i * 19;
        ctx.textAlign = 'left';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, c.x + 20, ly);
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = '#86efac';
        ctx.fillText(to, c.x + c.w - 20, ly);
        if (from !== null) {
          const tw = ctx.measureText(to).width;
          ctx.font = '13px system-ui, sans-serif';
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`${from} → `, c.x + c.w - 20 - tw, ly);
        }
      });
      ctx.textAlign = 'center';
      if (note) {
        ctx.font = note.hot ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
        ctx.fillStyle = note.hot ? '#fde047' : 'rgba(253,230,138,0.65)';
        ctx.fillText(note.text, c.x + c.w / 2, y + c.h - 28);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(String(c.k + 1), c.x + c.w / 2, y + c.h - 10);
    }
    ctx.globalAlpha = 1;
    for (const b of levelButtons()) button(b, hover && hover.id === b.id, false);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Keys: 1 2 3 pick · R reroll · X skip', W / 2, 486);
  }

  const SPIN_POOL = [...Object.keys(WEAPONS), ...Object.keys(PASSIVES)];
  const easeOutBack = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

  function drawChest(now) {
    const ch = state.chest;
    ctx.fillStyle = 'rgba(3,6,14,0.78)';
    ctx.fillRect(0, 0, W, H);
    if (ch.evo && ch.t < ch.r0) {
      drawEvoReveal(ch, now);
      return;
    }
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    const t = ch.t - ch.r0;
    const open = Math.min(1, t / 0.5);
    drawRays(W / 2, 110, 60 + 160 * open, now * 0.4, 'rgba(251,191,36,0.1)', 12);
    drawGlow(W / 2, 110, 90 * open + 30, '#fbbf24');
    ctx.save();
    ctx.translate(W / 2, 110);
    ctx.rotate(t < 0.5 ? Math.sin(t * 60) * 0.08 : 0);
    const sc = t < 0.5 ? 1 : 1 + 0.12 * Math.max(0, 1 - (t - 0.5) / 0.2);
    ctx.scale(sc, sc);
    drawIcon('chest', 0, 0, 84);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Treasure!', W / 2, 184);
    const rows = ch.rewards;
    rows.forEach((o, i) => {
      const at = t - 0.4 - i * 0.08;
      if (at < 0) return;
      ctx.globalAlpha = Math.min(1, at / 0.2);
      const info = optionInfo(o);
      const y = 206 + i * 64 + (1 - Math.min(1, at / 0.2)) * 12;
      const landed = ch.t >= ch.lands[i];
      const la = ch.t - ch.lands[i]; // seconds since this reel landed
      roundRect(W / 2 - 230, y, 460, 56, 12);
      ctx.fillStyle = landed && o.kind === 'evo' ? 'rgba(251,191,36,0.16)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      if (landed && (o.kind === 'evo' || la < 0.35)) {
        ctx.strokeStyle = la < 0.35 ? `rgba(255,255,255,${1 - la / 0.35})` : '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // The icon window: a spinning reel until it lands.
      const ix = W / 2 - 200;
      const iy = y + 28;
      roundRect(ix - 22, iy - 22, 44, 44, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      if (!landed) {
        ctx.save();
        roundRect(ix - 22, iy - 22, 44, 44, 8);
        ctx.clip();
        const spin = ch.t * 14 + i * 3;
        const off = (spin % 1) * 44;
        const id = SPIN_POOL[Math.floor(spin) % SPIN_POOL.length];
        const id2 = SPIN_POOL[(Math.floor(spin) + 1) % SPIN_POOL.length];
        drawIcon(id, ix, iy + off, 32);
        drawIcon(id2, ix, iy + off - 44, 32);
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText('? ? ?', W / 2 - 172, y + 33);
        return;
      }
      if (la < 0.4) drawGlow(ix, iy, 44 * (1 + la), o.kind === 'evo' ? '#fde047' : info.color);
      const pop = la < 0.15 ? 1 + 0.35 * (1 - la / 0.15) : 1;
      drawIcon(info.icon, ix, iy, 36 * pop);
      ctx.textAlign = 'left';
      ctx.fillStyle = info.color;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(`${info.name}${info.tag ? ` · ${info.tag}` : ''}`, W / 2 - 172, y + 24);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(info.desc.length > 62 ? `${info.desc.slice(0, 60)}…` : info.desc, W / 2 - 172, y + 43);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    if (ch.t >= ch.done - 0.25) {
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`+${ch.gold} gold`, W / 2, 206 + rows.length * 64 + 18);
    }
    if (ch.t >= ch.done) button(chestButton(), hover && hover.id === 'collect', true);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Click or press Space to skip', W / 2, 470);
    }
  }

  // The evolution moment: the weapon and its passive fuse in a burst of light.
  function drawEvoReveal(ch, now) {
    const t = ch.t;
    const o = ch.rewards.find((r) => r.kind === 'evo');
    const def = WEAPONS[o.id];
    const cx = W / 2;
    const cy = 220;
    ctx.globalAlpha = clamp((ch.r0 - t) / 0.3, 0, 1);
    ctx.fillStyle = 'rgba(2,2,8,0.55)';
    ctx.fillRect(0, 0, W, H);
    const fuse = clamp(t / 0.45, 0, 1);
    if (fuse < 1) {
      // The weapon and its passive rush together.
      const d = (1 - fuse * fuse) * 260;
      drawGlow(cx - d, cy, 40, def.color);
      drawIcon(o.id, cx - d, cy, 64);
      drawGlow(cx + d, cy, 40, '#e2e8f0');
      drawIcon(def.pair, cx + d, cy, 56);
    } else {
      const k = clamp((t - 0.45) / 0.4, 0, 1);
      const b = easeOutBack(k);
      drawRays(cx, cy, 560 * Math.min(1, k * 1.5), now * 0.5, 'rgba(253,224,71,0.13)', 16);
      drawRays(cx, cy, 400 * Math.min(1, k * 1.5), -now * 0.8, 'rgba(255,255,255,0.07)', 10);
      drawGlow(cx, cy, 170 * b, '#fde68a');
      // Sparks flying out from the fusion.
      const st = t - 0.45;
      for (let i = 0; i < 46; i++) {
        const a = hash(i, 1, 5) * Math.PI * 2;
        const v = 180 + hash(i, 2, 5) * 420;
        const tt = Math.min(st, 1.6);
        const r = v * tt * (1 - tt / 3.2);
        const al = 1 - st / 1.8;
        if (al <= 0) break;
        ctx.globalAlpha = al * clamp((ch.r0 - t) / 0.3, 0, 1);
        ctx.fillStyle = i % 3 ? '#fde68a' : '#ffffff';
        ctx.fillRect(cx + Math.cos(a) * r - 2, cy + Math.sin(a) * r - 2, 4, 4);
      }
      ctx.globalAlpha = clamp((ch.r0 - t) / 0.3, 0, 1);
      ctx.save();
      ctx.translate(cx, cy + Math.sin(now * 2) * 4);
      ctx.scale(b, b);
      drawIcon(`${o.id}*`, 0, 0, 140);
      ctx.restore();
      if (st < 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${(1 - st / 0.3) * 0.85})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.textAlign = 'center';
    const tk = clamp((t - 0.1) / 0.3, 0, 1);
    ctx.globalAlpha = tk * clamp((ch.r0 - t) / 0.3, 0, 1);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('E V O L U T I O N', cx, 82);
    const nk = clamp((t - 0.6) / 0.3, 0, 1);
    if (nk > 0) {
      ctx.globalAlpha = nk * clamp((ch.r0 - t) / 0.3, 0, 1);
      ctx.font = `bold ${Math.round(40 + (1 - nk) * 16)}px Georgia, serif`;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(def.evo.name, cx, 370);
      ctx.fillStyle = '#fde047';
      ctx.fillText(def.evo.name, cx, 370);
      ctx.lineJoin = 'miter';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`${def.name} + ${PASSIVES[def.pair].name}: ${def.evo.desc}`, cx, 402);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Tutorial (first run only)
  // ---------------------------------------------------------------------------

  const TUT = [
    { text: 'Move with WASD or the arrow keys, or drag anywhere on the screen.', until: () => state.moved > 260, max: 14 },
    { text: 'Your weapons fire on their own. Keep moving and keep your distance!', max: 5 },
    { text: 'Walk over soul gems to gather them. Fill the bar at the top to level up.', until: () => state.level >= 2, max: 25 },
    { text: 'Get a weapon to level 8 and take its paired passive, then open a chest to evolve it.', max: 7 },
    { text: 'Glowing elites drop chests. Bosses come at 5:00 and 10:00. Good luck!', max: 5 },
  ];

  function updateTutorial(dt) {
    const tu = state.tut;
    if (!tu || state.mode !== 'playing' || state.cine) return;
    tu.t += dt;
    const st = TUT[tu.step];
    if (tu.t >= st.max || (st.until && tu.t > 1.5 && st.until())) {
      tu.step++;
      tu.t = 0;
      if (tu.step >= TUT.length) endTutorial();
    }
  }

  function endTutorial() {
    state.tut = null;
    save.tut = true;
    writeSave();
  }

  function drawTutorial(now) {
    const tu = state.tut;
    const st = TUT[tu.step];
    const a = Math.min(1, tu.t / 0.3, (st.max - tu.t) / 0.3 + (st.until ? 1 : 0));
    const x = W / 2 - 290;
    const y = H - 116;
    ctx.globalAlpha = clamp(a, 0, 1);
    roundRect(x, y, 580, 54, 12);
    ctx.fillStyle = 'rgba(15,10,35,0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`HOW TO PLAY · ${tu.step + 1}/${TUT.length}`, x + 16, y + 20);
    ctx.fillStyle = '#f5f3ff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(st.text, x + 16, y + 40, 470);
    ctx.globalAlpha = 1;
    const b = tutButton();
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = hover && hover.id === 'tutskip' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 20);
    // Point at the gem bar while explaining it.
    if (tu.step === 2) {
      const bob = Math.sin(now * 6) * 4;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      const ax = W * 0.33;
      ctx.moveTo(ax, 18 + bob);
      ctx.lineTo(ax - 9, 32 + bob);
      ctx.lineTo(ax + 9, 32 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBanner() {
    const b = state.banner;
    const a = Math.min(1, b.t / 0.4);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(b.text, W / 2, 150);
    ctx.fillStyle = '#f5d0fe';
    ctx.fillText(b.text, W / 2, 150);
    if (b.sub) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(b.sub, W / 2, 176);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(b.sub, W / 2, 176);
    }
    ctx.globalAlpha = 1;
  }

  function drawStick() {
    const s = input.stick;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > 50 ? 50 / d : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(s.ox + dx * k, s.oy + dy * k, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay)
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');
  let menuView = 'menu';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const iconUrl = (id) => icons[id].toDataURL();
  const heroUrl = (id) => heroSprite(id, 0).img[0].toDataURL();

  function bestLine() {
    const b = save.best;
    if (!b) return '';
    return `<p class="help">Best: ${b.won ? `defeated the Nameless in ${formatTime(b.time)}` : `survived ${formatTime(b.time)}`}, level ${b.level}, ${b.kills.toLocaleString()} kills.</p>`;
  }

  function buildList() {
    const ws = state.weapons.map((w) => {
      const def = WEAPONS[w.id];
      return `<li><img src="${iconUrl(wIcon(w))}" alt=""> ${esc(w.evolved ? def.evo.name : def.name)} <span>${w.evolved ? 'evolved' : `Lv ${w.level}`}</span></li>`;
    });
    const ps = state.passives.map((p) => `<li><img src="${iconUrl(p.id)}" alt=""> ${esc(PASSIVES[p.id].name)} <span>Lv ${p.level}</span></li>`);
    return `<ul class="sv-build">${ws.join('')}${ps.join('')}</ul>`;
  }

  function recipes() {
    const rows = Object.entries(WEAPONS).map(([id, w]) =>
      `<li><img src="${iconUrl(id)}" alt=""> ${esc(w.name)} <span>+</span> <img src="${iconUrl(w.pair)}" alt=""> ${esc(PASSIVES[w.pair].name)} <span>→</span> <b>${esc(w.evo.name)}</b></li>`);
    return `<details class="sv-all"><summary>All evolution recipes</summary><ul class="sv-recipes">${rows.join('')}</ul></details>`;
  }

  // Which of your weapons are ready (or close) to evolve.
  function tracker() {
    if (!state.weapons.length) return '';
    const rows = state.weapons.map((w) => {
      const def = WEAPONS[w.id];
      const has = hasPassive(def.pair);
      let status;
      let cls = '';
      if (w.evolved) {
        status = '★ Evolved';
        cls = 'done';
      } else if (canEvolve(w)) {
        status = 'Ready! Open a chest';
        cls = 'ready';
      } else {
        const need = [];
        if (w.level < WEAPON_MAX) need.push(`Lv ${w.level}/${WEAPON_MAX}`);
        if (!has) need.push(`needs ${PASSIVES[def.pair].name}`);
        status = need.join(' · ');
        if (w.level >= 6 || has) cls = 'close';
      }
      return `<li class="${cls}"><img src="${iconUrl(wIcon(w))}" alt=""> <img class="${has ? '' : 'missing'}" src="${iconUrl(def.pair)}" alt="${esc(PASSIVES[def.pair].name)}"> ${esc(def.name)} <span>→</span> <b>${esc(def.evo.name)}</b> <em>${esc(status)}</em></li>`;
    });
    return `<h3 class="sv-h3">Evolutions</h3><ul class="sv-evo">${rows.join('')}</ul>`;
  }

  function settingsRow() {
    const b = (k, label) => `<button type="button" class="sv-toggle${setting(k) ? ' on' : ''}" data-set="${k}" aria-pressed="${setting(k)}">${label}: ${setting(k) ? 'On' : 'Off'}</button>`;
    return `<div class="row sv-settings">${b('dmg', 'Damage numbers')}${b('shake', 'Screen shake')}</div>`;
  }

  // A small preview of each map for the menu.
  const mapUrls = {};
  function mapUrl(id) {
    if (!mapUrls[id]) {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 120;
      const g = c.getContext('2d');
      const tile = makeTile(id, 0, 1);
      g.drawImage(tile, 0, 60, 256, 128, 0, 0, 240, 120);
      const props = propsFor(id);
      for (const [x, y, k] of [[48, 66, 1], [178, 58, 0], [120, 98, 2]]) {
        const pr = props[k];
        g.drawImage(pr.img, x - pr.w * 0.6, y - pr.h * 0.6, pr.w * 1.2, pr.h * 1.2);
      }
      const v = g.createRadialGradient(120, 60, 30, 120, 60, 140);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = v;
      g.fillRect(0, 0, 240, 120);
      mapUrls[id] = c.toDataURL();
    }
    return mapUrls[id];
  }

  let overlayKind = null;

  function showOverlay(kind) {
    overlayKind = kind;
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    if (kind === 'menu') {
      const chars = Object.entries(CHARS).map(([id, c]) => {
        const owned = save.chars[id];
        const sel = save.char === id;
        const afford = save.gold >= c.cost;
        return `<button type="button" class="sv-char${sel ? ' sel' : ''}${owned ? '' : ' locked'}" data-char="${id}" ${!owned && !afford ? 'aria-disabled="true"' : ''}>
            <img src="${heroUrl(id)}" alt="">
            <b>${esc(c.name)}</b>
            <small>${esc(c.perk)}</small>
            ${owned ? '' : `<em>${afford ? 'Unlock' : 'Locked'}: ${c.cost} gold</em>`}
          </button>`;
      }).join('');
      const maps = MAP_ORDER.map((id) => {
        const m = MAPS[id];
        const owned = save.maps[id];
        return `<button type="button" class="sv-map${save.map === id ? ' sel' : ''}${owned ? '' : ' locked'}" data-map="${id}" ${owned ? '' : 'aria-disabled="true"'}>
            <img src="${mapUrl(id)}" alt="">
            <b>${owned ? '' : '🔒 '}${esc(m.name)}</b>
            <small>${owned ? esc(m.desc) : `Survive 10:00 on the ${esc(MAPS[m.unlock].name)} to unlock.`}</small>
          </button>`;
      }).join('');
      const curse = save.veteran
        ? `<button type="button" class="sv-curse${save.curse ? ' on' : ''}" data-act="curse" aria-pressed="${save.curse}">☠ Curse: ${save.curse ? 'On' : 'Off'}</button>
           <span class="help sv-curse-note">More, faster, tougher enemies · +50% gold</span>`
        : '<span class="help sv-curse-note">☠ Survive 10 minutes to unlock the Curse.</span>';
      overlay.innerHTML = `
        <div class="sv-panel">
          <h2>Nameless Survivor</h2>
          <p class="sv-intro">Your weapons fire on their own. Gather soul gems, level up and evolve your weapons. Last 15 minutes to face the Nameless.</p>
          <div class="sv-chars">${chars}</div>
          <div class="sv-maps">${maps}</div>
          <div class="row sv-curse-row">${curse}</div>
          <div class="row sv-start">
            <button type="button" class="primary" data-act="start">Start as ${esc(CHARS[save.char].name)}</button>
            <button type="button" data-act="shop">Upgrades</button>
          </div>
          <p class="help"><img class="coin" src="${iconUrl('coin')}" alt=""> ${Math.floor(save.gold).toLocaleString()} gold to spend</p>
          ${bestLine()}
          ${settingsRow()}
          <p class="help sv-keys">WASD or arrows to move (or drag on the screen) · P pause · M mute · F fullscreen</p>
        </div>`;
    } else if (kind === 'shop') {
      const items = Object.entries(SHOP).map(([id, s]) => {
        const r = save.shop[id] || 0;
        const cost = s.cost * (r + 1);
        const max = r >= s.max;
        const icon = icons[id] ? `<img src="${iconUrl(id)}" alt="">` : `<img src="${iconUrl(id === 'growth' ? 'reach' : id === 'greed' ? 'coin' : id === 'reroll' ? 'echo' : 'vigor')}" alt="">`;
        return `<div class="sv-item">
            ${icon}
            <div><b>${esc(s.name)}</b> <span class="pips">${'●'.repeat(r)}${'○'.repeat(s.max - r)}</span><br><small>${esc(s.desc)}</small></div>
            <button type="button" data-buy="${id}" ${max || save.gold < cost ? 'disabled' : ''}>${max ? 'Max' : `${cost}`}</button>
          </div>`;
      }).join('');
      overlay.innerHTML = `
        <div class="sv-panel">
          <h2>Upgrades</h2>
          <p><img class="coin" src="${iconUrl('coin')}" alt=""> ${Math.floor(save.gold).toLocaleString()} gold. Upgrades last for every run.</p>
          <div class="sv-shop">${items}</div>
          <div class="row">
            <button type="button" class="primary" data-act="menu">Back</button>
            <button type="button" data-act="refund">Refund all</button>
          </div>
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div class="sv-panel">
          <h2>Paused</h2>
          <p>${esc(MAPS[state.map].name)}${state.curse ? ' (cursed)' : ''} · ${formatTime(state.t)} · level ${state.level} · ${state.kills.toLocaleString()} kills</p>
          ${buildList()}
          ${tracker()}
          ${recipes()}
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="quit">Give up</button>
          </div>
          ${settingsRow()}
        </div>`;
    } else if (kind === 'over') {
      const total = Object.values(state.dmgBy).reduce((a, b) => a + b, 0) || 1;
      const dmg = state.weapons
        .map((w) => [w, state.dmgBy[w.id] || 0])
        .sort((a, b) => b[1] - a[1])
        .map(([w, d]) => `<li><img src="${iconUrl(wIcon(w))}" alt=""> ${esc(w.evolved ? WEAPONS[w.id].evo.name : WEAPONS[w.id].name)} <span>${Math.round(d).toLocaleString()} (${Math.round((d / total) * 100)}%)</span></li>`)
        .join('');
      overlay.innerHTML = `
        <div class="sv-panel">
          <h2>${state.won ? 'You survived' : 'You fell'}</h2>
          <p>${state.won ? `The Nameless is destroyed. ${formatTime(state.winTime || state.t)}` : `Survived ${formatTime(state.t)}`} · level ${state.level} · ${state.kills.toLocaleString()} kills</p>
          <p><img class="coin" src="${iconUrl('coin')}" alt=""> +${state.earned.toLocaleString()} gold${state.won ? ' (including a victory bonus)' : ''}</p>
          ${state.unlocked ? `<p class="sv-unlock">New map unlocked: <b>${esc(MAPS[state.unlocked].name)}</b>!</p>` : ''}
          <ul class="sv-build">${dmg}</ul>
          ${bestLine()}
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
    menuView = 'menu';
    showOverlay('menu');
  }

  function start() {
    newGame();
    showOverlay(null);
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing' && state.endT <= 0) {
      state.mode = 'paused';
      input.stick = null;
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

  function activate(id) {
    if (id === 'pause') togglePause();
    else if (id === 'mute') Sound.muted = !Sound.muted;
    else if (id === 'full') toggleFullscreen();
    else if (id.startsWith('card:')) choose(Number(id.slice(5)));
    else if (id === 'reroll') reroll();
    else if (id === 'skip') skip();
    else if (id === 'collect') closeChest();
    else if (id === 'tutskip') endTutorial();
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    Sound.click();
    if (b.dataset.char) {
      const id = b.dataset.char;
      if (!save.chars[id]) {
        const cost = CHARS[id].cost;
        if (save.gold < cost) return;
        save.gold -= cost;
        save.chars[id] = true;
      }
      save.char = id;
      writeSave();
      newGame();
      state.mode = 'menu';
      showOverlay('menu');
      return;
    }
    if (b.dataset.map) {
      if (!save.maps[b.dataset.map]) return;
      save.map = b.dataset.map;
      writeSave();
      newGame();
      state.mode = 'menu';
      showOverlay('menu');
      return;
    }
    if (b.dataset.set) {
      const k = b.dataset.set;
      save.settings[k] = !setting(k);
      writeSave();
      if (k === 'dmg' && !setting('dmg') && state) state.texts = state.texts.filter((t) => t.heal);
      const scroll = overlay.scrollTop;
      showOverlay(overlayKind);
      overlay.scrollTop = scroll;
      return;
    }
    if (b.dataset.buy) {
      const id = b.dataset.buy;
      const r = save.shop[id] || 0;
      const cost = SHOP[id].cost * (r + 1);
      if (r < SHOP[id].max && save.gold >= cost) {
        save.gold -= cost;
        save.shop[id] = r + 1;
        writeSave();
      }
      showOverlay('shop');
      return;
    }
    const act = b.dataset.act;
    if (act === 'start') start();
    else if (act === 'resume') togglePause();
    else if (act === 'menu') showMenu();
    else if (act === 'shop') showOverlay('shop');
    else if (act === 'curse') {
      save.curse = !save.curse;
      writeSave();
      newGame();
      state.mode = 'menu';
      showOverlay('menu');
    }
    else if (act === 'refund') {
      for (const [id, r] of Object.entries(save.shop)) {
        for (let k = 0; k < r; k++) save.gold += SHOP[id].cost * (k + 1);
      }
      save.shop = {};
      writeSave();
      showOverlay('shop');
    } else if (act === 'quit') {
      state.mode = 'playing';
      finish();
    }
  });

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = e.pointerType === 'mouse';
    if (input.stick && input.stick.id === e.pointerId) {
      input.stick.x = p.x;
      input.stick.y = p.y;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    input.over = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (e.button !== 0) return;
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    const hit = hitTest(p.x, p.y);
    if (hit) {
      activate(hit.id);
      return;
    }
    if (state && state.mode === 'playing') {
      // Drag anywhere to move (for touch screens, and mice too).
      input.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  const endStick = (e) => {
    if (input.stick && input.stick.id === e.pointerId) input.stick = null;
  };
  window.addEventListener('pointerup', endStick);
  window.addEventListener('pointercancel', endStick);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.muted = !Sound.muted; return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state) return;
    if (state.mode === 'levelup') {
      if (k >= '1' && k <= '4') choose(Number(k) - 1);
      else if (k === 'r') reroll();
      else if (k === 'x') skip();
      if (k === ' ') e.preventDefault();
      return;
    }
    if (state.mode === 'chest' && (k === 'enter' || k === ' ')) {
      e.preventDefault();
      closeChest();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      input.keys.add(k);
      if (state.mode === 'playing') e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.stick = null;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && state.mode === 'playing' && !AUTOPLAY) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  function autoPick() {
    if (!AUTOPLAY && !simulating) return;
    if (state.mode === 'levelup') botChoose();
    else if (state.mode === 'chest') {
      state.chest.t = Math.max(state.chest.t, state.chest.done);
      closeChest();
    }
  }

  function updateCine(dt) {
    const c = state.cine;
    const before = c.t;
    c.t += dt;
    // The name card lands with a thud.
    if (before < 0.6 && c.t >= 0.6) {
      shake(8);
      Sound.slam();
    }
    if (c.t >= c.dur) state.cine = null;
  }

  // Heartbeat when health is low (real time, so it keeps pace in slow motion).
  function updateHeart(dt) {
    const p = state.p;
    const k = p.hp / p.maxHp;
    if (k >= 0.3 || p.hp <= 0 || state.endT > 0) {
      state.heartT = 0;
      return;
    }
    state.heartT -= dt;
    if (state.heartT <= 0) {
      state.heartT = k < 0.15 ? 0.6 : 0.85;
      Sound.heart();
    }
  }

  // Advances the pre-evolution slow motion; returns the game speed factor.
  function updateSlowmo(real) {
    if (!state.slowmo) return 1;
    state.slowmo.t += real;
    if (state.slowmo.t >= SLOWMO) {
      const boss = state.slowmo.boss;
      state.slowmo = null;
      openChest(boss);
    }
    return 0.15;
  }

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state && state.mode === 'playing') {
      if (state.hitstop > 0) state.hitstop -= real; // a frozen beat after a big kill
      else if (state.cine) updateCine(real);
      else {
        let left = real * SPEED * updateSlowmo(real);
        while (left > 0 && state.mode === 'playing') {
          const dt = Math.min(1 / 60, left);
          step(dt);
          left -= dt;
        }
        updateTutorial(real);
      }
      if (state.mode === 'playing') updateHeart(real);
    }
    if (state && AUTOPLAY && state.choiceT > 0.4) autoPick();
    if (state && AUTOPLAY && state.mode === 'chest' && state.chest.t > state.chest.done + 0.6) autoPick();
    if (state && state.mode !== 'paused') updateEffects(real);
    render();
    requestAnimationFrame(frame);
  }

  // Plays a whole run as fast as possible with the bot; returns a summary.
  function simulate(opts = {}) {
    simulating = true;
    const keep = save;
    save = { ...freshSave(), shop: { ...(opts.shop || {}) }, chars: { [opts.char || 'wanderer']: true }, maps: { moor: true, fen: true, ruins: true }, tut: true };
    newGame(opts.char || 'wanderer', opts.map || 'moor', !!opts.curse);
    const trace = [];
    const dt = 1 / 30;
    const limit = opts.limit || RUN_TIME + 240;
    let nextLog = 60;
    while (state.mode !== 'over' && state.t < limit) {
      if (state.mode === 'levelup' || state.mode === 'chest') autoPick();
      else step(dt);
      state.fx.length = 0;
      state.parts.length = 0;
      state.texts.length = 0;
      if (state.t >= nextLog) {
        nextLog += 60;
        trace.push({ t: Math.round(state.t), lv: state.level, hp: Math.round(state.p.hp), foes: state.foes.length, kills: state.kills });
      }
    }
    const out = {
      map: state.map,
      curse: state.curse,
      won: state.won,
      t: Math.round(state.t),
      level: state.level,
      kills: state.kills,
      gold: Math.round(state.gold),
      weapons: state.weapons.map((w) => `${w.id}${w.evolved ? '*' : w.level}`).join(' '),
      passives: state.passives.map((p) => `${p.id}${p.level}`).join(' '),
      dmg: Object.fromEntries(Object.entries(state.dmgBy).map(([k, v]) => [k, Math.round(v)])),
      hurt: Object.fromEntries(Object.entries(state.hurtBy).map(([k, v]) => [k, Math.round(v)])),
      trace,
    };
    save = keep;
    simulating = false;
    showMenu();
    return out;
  }

  // Hooks for automated testing (?autoplay plays with a bot).
  window.__sv = {
    get state() { return state; },
    get save() { return save; },
    input,
    start,
    choose,
    reroll,
    skip,
    closeChest,
    openChest,
    spawnFoe,
    simulate,
    showMenu,
    togglePause,
    endTutorial,
    WEAPONS,
    MAPS,
    FOES,
    get settings() { return { dmg: setting('dmg'), shake: setting('shake') }; },
    // Pick a map for the next run (unlocking it if asked to).
    setMap(id, unlock) {
      if (!MAPS[id]) return;
      if (unlock) save.maps[id] = true;
      if (save.maps[id]) save.map = id;
    },
    step(dt) {
      if (state.cine) updateCine(dt);
      else if (state.slowmo) {
        const k = updateSlowmo(dt);
        if (state.mode === 'playing') step(dt * k);
      } else step(dt);
      updateEffects(dt);
    },
    grant(id, level, evolved) {
      let w = state.weapons.find((x) => x.id === id);
      if (!w) {
        addWeapon(id);
        w = state.weapons[state.weapons.length - 1];
      }
      w.level = level;
      w.evolved = !!evolved;
      computeStats();
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
