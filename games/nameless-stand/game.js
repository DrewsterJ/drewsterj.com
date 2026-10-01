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
  const SEARCHLIGHT = { x: 52, y: 292 }; // lamp on a post at the back of the tower
  const NIGHTS = 20;
  const DAY_HOURS = 12;
  const PLAYER_MAX = 100;
  const CREW_MAX_HP = 100;
  const MAX_SURVIVORS = 4;
  const MAX_MINES = 8;
  const HEADSHOT = 2.5;
  const LIT_BONUS = 1.25; // zombies caught in a flare or the searchlight take extra damage
  const SECTIONS = 4; // the barricade is four sections, one per lane
  const FLARES_BASE = 2;
  const OUTLINE = '#0c0a09';

  // The barricade is a wall running into the screen at a slight angle, so its
  // face (towards the zombies) is visible.
  const WALL = { x: 238, lean: 30, height: 58 };

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const AIM_ERROR = Number(params.get('aim')) || 10; // autoplay aim wobble, in pixels
  const AIM_SLEW = Number(params.get('slew')) || 900; // autoplay mouse speed, in pixels per second

  // Weapons, in the order they are found while scavenging. `buy` is the
  // armory price in materials, `pack`/`packCost` an ammo crate.
  const WEAPONS = [
    { name: 'Pistol', short: 'Pistol', kind: 'pistol', dmg: 24, rate: 0.2, auto: false, mag: 12, reload: 1.1,
      spread: 0.012, bloom: 0.012, pellets: 1, pierce: 1, find: 0, len: 16, buy: 0, pack: 0, packCost: 0, from: 1,
      snd: { crack: 3400, body: 1500, dur: 0.15, thump: 160, vol: 0.3 }, casing: '#d4a017' },
    { name: 'Shotgun', short: 'Shotgun', kind: 'shotgun', dmg: 14, rate: 0.75, auto: false, mag: 6, reload: 2.0,
      spread: 0.1, bloom: 0, pellets: 8, pierce: 1, find: 18, len: 30, buy: 45, pack: 12, packCost: 6, from: 2,
      snd: { crack: 2400, body: 700, dur: 0.34, thump: 90, vol: 0.42, mech: 'pump' }, casing: '#b91c1c' },
    { name: 'SMG', short: 'SMG', kind: 'smg', dmg: 15, rate: 0.075, auto: true, mag: 32, reload: 1.6,
      spread: 0.03, bloom: 0.006, pellets: 1, pierce: 1, find: 90, len: 24, buy: 95, pack: 64, packCost: 9, from: 4,
      snd: { crack: 4000, body: 1900, dur: 0.09, thump: 180, vol: 0.22 }, casing: '#d4a017' },
    { name: 'Hunting Rifle', short: 'Rifle', kind: 'rifle', dmg: 95, rate: 0.85, auto: false, mag: 5, reload: 1.9,
      spread: 0, bloom: 0, pellets: 1, pierce: 3, find: 16, len: 34, buy: 70, pack: 10, packCost: 7, from: 3,
      snd: { crack: 4400, body: 900, dur: 0.42, thump: 80, vol: 0.44, mech: 'bolt' }, casing: '#e2b13c' },
    { name: 'Machine Gun', short: 'MG', kind: 'mg', dmg: 22, rate: 0.065, auto: true, mag: 100, reload: 3.6,
      spread: 0.045, bloom: 0.004, pellets: 1, pierce: 1, find: 140, len: 36, buy: 190, pack: 100, packCost: 16, from: 8,
      snd: { crack: 3000, body: 1200, dur: 0.17, thump: 110, vol: 0.28 }, casing: '#e2b13c' },
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
    // Two zombies carrying a siege ladder, drawn as one.
    ladder: { hp: 200, speed: 26, dmg: 0, rate: 1, w: 46, h: 48, headR: 7.5, lean: -0.15, bulk: 1 },
    boss: { hp: 2400, speed: 10, dmg: 80, rate: 1.6, w: 56, h: 104, headR: 14, lean: -0.35, bulk: 2.4 },
  };
  // Zombies that can climb a planted ladder.
  const CLIMBERS = ['walker', 'runner', 'riot', 'screamer'];

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
  // How nights grow: zombies per night, and zombie health growth per night.
  const WAVE = { base: Number(params.get('wb')) || 16, per: Number(params.get('wp')) || 6.2, hp: Number(params.get('wh')) || 0.075 };
  // Set pieces.
  const BOSS_NIGHTS = [10, 15, 20];
  const HORDE_NIGHTS = [5, 12, 18];
  const SIEGE_NIGHTS = { 7: 1, 9: 1, 13: 2, 17: 2, 20: 3 }; // ladder crews per night

  // Base building.
  const TIERS = [
    { name: 'Wooden barricade', max: 500 },
    { name: 'Reinforced barricade', max: 850, cost: 40 },
    { name: 'Steel barricade', max: 1300, cost: 100 },
  ];
  const WIRE = [{ dps: 0 }, { dps: 5, cost: 20 }, { dps: 10, cost: 45 }, { dps: 16, cost: 80 }];
  const SPIKES = [{ dps: 0, slow: 0 }, { dps: 12, slow: 0.3, cost: 30 }, { dps: 24, slow: 0.45, cost: 70 }];
  const MINE = { cost: 8, radius: 70, dmg: 180 };
  const LIGHTS = [{ width: 0 }, { width: 0.085, cost: 50 }, { width: 0.12, cost: 90 }];
  const FLARE_KIT = [{ extra: 0 }, { extra: 1, cost: 25 }, { extra: 2, cost: 55 }];

  // Scavenging runs.
  const LOCATIONS = [
    { id: 'hardware', name: 'Hardware store', short: 'Hardware', risk: 0.04, riskLabel: 'Low risk', desc: 'Building materials.' },
    { id: 'police', name: 'Police station', short: 'Police', risk: 0.13, riskLabel: 'High risk', desc: 'Guns and ammo.' },
    { id: 'hospital', name: 'Hospital', short: 'Hospital', risk: 0.08, riskLabel: 'Some risk', desc: 'Medkits, a few materials.' },
    { id: 'market', name: 'Supermarket', short: 'Market', risk: 0.05, riskLabel: 'Low risk', desc: 'A little of everything.' },
    { id: 'army', name: 'Army checkpoint', short: 'Army base', risk: 0.17, riskLabel: 'Very risky', desc: 'Heavy guns, ammo, flares.', from: 6 },
  ];

  // Survivor personalities. acc: chance to hit, head: chance to aim for the
  // head, cd: seconds between shots, dmg: per hit before night scaling.
  const TRAITS = {
    sharpshooter: { label: 'Sharpshooter', desc: 'Rarely misses, loves headshots', gun: 'rifle', acc: 0.85, head: 0.45, cd: [2.1, 2.7], dmg: 16, color: '#93c5fd', weight: 2 },
    medic: { label: 'Medic', desc: 'Patches the whole crew up every day', gun: 'pistol', acc: 0.58, head: 0.15, cd: [1.2, 1.6], dmg: 11, color: '#fca5a5', weight: 2 },
    mechanic: { label: 'Mechanic', desc: 'Repairs twice as fast', gun: 'shotgun', acc: 0.7, head: 0.1, cd: [1.5, 1.9], dmg: 14, color: '#fcd34d', weight: 2 },
    scavenger: { label: 'Scavenger', desc: 'Finds more on runs and rarely gets hurt', gun: 'smg', acc: 0.55, head: 0.15, cd: [0.6, 0.8], dmg: 7, color: '#86efac', weight: 2 },
    veteran: { label: 'Veteran', desc: 'Steady bursts, never panics', gun: 'mg', acc: 0.66, head: 0.25, cd: [0.95, 1.25], dmg: 10, color: '#c4b5fd', weight: 1.5 },
    hothead: { label: 'Hothead', desc: 'Fires fast, aims badly, curses loudly', gun: 'smg', acc: 0.45, head: 0.1, cd: [0.38, 0.52], dmg: 6.5, color: '#fdba74', weight: 1.5 },
    coward: { label: 'Coward', desc: 'Hides when they get close. Great at not dying', gun: 'pistol', acc: 0.5, head: 0.15, cd: [1.5, 1.9], dmg: 10, color: '#d6d3d1', weight: 1 },
  };
  const ROLES = [
    { id: 'guard', label: 'Guard', tonight: 'Shoots from the wall tonight' },
    { id: 'repair', label: 'Repair', tonight: 'Helps repairs, patches the wall tonight' },
    { id: 'scavenge', label: 'Scavenge', tonight: 'Joins your run, tired tonight' },
    { id: 'rest', label: 'Rest', tonight: 'Heals up, sleeps through the night' },
  ];
  const NAMES = ['Maya', 'Jonah', 'Rosa', 'Theo', 'Priya', 'Marcus', 'Elena', 'Dmitri', 'Kenji', 'Lena', 'Gus', 'Ada',
    'Omar', 'Hazel', 'Ruben', 'Ivy', 'Sam', 'Nadia', 'Felix', 'June', 'Bo', 'Carmen', 'Wes', 'Tova', 'Abe', 'Lou',
    'Mei', 'Rafe', 'Esme', 'Hank', 'Zara', 'Otis'];

  // Things the crew say. {name} is replaced with a crewmate's name.
  const QUIPS = {
    start: ['Here they come.', 'Lock and load.', 'Another long night.', 'Stay sharp, everyone.', 'I hate this part.', 'Eyes on the street.'],
    kill: ['Got one!', 'Stay down.', 'Next!', 'That one\'s done.', 'Down you go.'],
    head: ['Right between the eyes.', 'Clean shot.', 'Headshot!'],
    breach: ['They\'re through!', 'The wall\'s breached!', 'Plug that gap!'],
    low: ['The wall won\'t hold much longer!', 'We need repairs out here!'],
    boss: ['What is THAT?', 'Oh no. Big one.', 'Aim for the head!'],
    ladder: ['Ladder! Shoot the ladder!', 'They\'re climbing over!'],
    hurt: ['Argh!', 'I\'m hit!', 'Get it off me!'],
    grief: ['No... not {name}.', 'We lost {name}!', 'Rest easy, {name}.'],
    flare: ['Light \'em up!', 'Now I can see you.', 'Pretty.'],
    storm: ['Great. Rain.', 'Can\'t see a thing in this.'],
    repair: ['Patching it up!', 'Cover me, I\'m fixing it!'],
    last: ['One left!', 'Just one more!'],
    horde: ['That\'s... a lot of them.', 'Here comes the horde!'],
    dawn: ['We made it.', 'Sun\'s up. Finally.', 'Still breathing.', 'Is that... daylight?'],
  };
  const TRAIT_QUIPS = {
    sharpshooter: ['One shot, one kill.', 'Breathe... squeeze.'],
    medic: ['Nobody dies on my watch.', 'Keep your heads down!'],
    mechanic: ['I can fix that.', 'Duct tape holds the world together.'],
    scavenger: ['Bet they had snacks.', 'I know a shortcut.'],
    veteran: ['Seen worse.', 'Short, controlled bursts.'],
    hothead: ['COME ON THEN!', 'Eat lead!', 'Who\'s next?!'],
    coward: ['I-I can\'t do this!', 'Why did I come here?', 'Is it over yet?'],
  };
  const DAY_QUIPS = {
    loot: ['Good haul today.', 'Told you it was worth it.', 'That should help.'],
    hurt: ['That was too close.', 'Somebody get the bandages.'],
    empty: ['Waste of a day.', 'Picked clean already.'],
    lost: ['We should have been there.', 'I can\'t stop thinking about it.'],
  };

  const SHIRTS = ['#57534e', '#44403c', '#475569', '#7c2d12', '#365314', '#3f3f46', '#713f12', '#1e3a5f'];
  const PANTS = ['#1f2937', '#292524', '#3b3b4f', '#27303f', '#3f2e20'];
  const SKINS = ['#7d9a6a', '#8ea37a', '#6f8b61', '#94a38a', '#88977a'];
  const CREW_SKINS = ['#f5d0a9', '#e0b48a', '#c68c5e', '#8d5a3b', '#f1c6a0'];
  const JACKETS = ['#1d4ed8', '#0f766e', '#a16207', '#9d174d', '#4d7c0f', '#7c3aed', '#b45309'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const depth = (y) => 0.8 + 0.4 * ((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP));
  const baseWallX = (y) => WALL.x + WALL.lean / 2 - ((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP)) * WALL.lean;
  // Which barricade section (lane) a ground y belongs to.
  const secOf = (y) => clamp(Math.floor(((y - FIELD_TOP) / (FIELD_BOT - FIELD_TOP)) * SECTIONS), 0, SECTIONS - 1);
  const secMidY = (i) => FIELD_TOP + ((i + 0.5) * (FIELD_BOT - FIELD_TOP)) / SECTIONS;
  // The wall face, pushed back where a giant has been shoving it.
  const wallX = (y) => baseWallX(y) - (state ? state.sections[secOf(y)].push : 0);
  const tier = () => TIERS[state.build.tier];
  const secMax = () => tier().max / SECTIONS;
  const article = (name) => (/^(SMG|[AEIOU])/.test(name) ? 'an' : 'a');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

  // --- Saved data (all optional: storage can be unavailable) --------------------

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || null;
    } catch {
      return null;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode); nothing is kept.
    }
  }

  // Older saves have { night, kills, won } from when the game was 15 nights long.
  const loadBest = () => loadJSON('nameless-stand-best');

  function saveBest(run) {
    const best = loadBest();
    if (best && (best.night > run.night || (best.night === run.night && best.kills >= run.kills))) return;
    saveJSON('nameless-stand-best', run);
  }

  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const settings = Object.assign({ shake: !reduceMotion, fx: reduceMotion ? 'reduced' : 'full' },
    loadJSON('nameless-stand-settings') || {});
  const saveSettings = () => saveJSON('nameless-stand-settings', settings);
  const reduced = () => settings.fx === 'reduced';
  // Fewer particles with reduced effects.
  const fx = (n) => (reduced() ? Math.ceil(n / 2) : n);
  let tutorialDone = !!loadJSON('nameless-stand-tutorial');

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    muted: false,
    last: {},
    noiseBuf: null,
    master: null,
    verb: null,
    amb: null,
    ambKind: null,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const c = new AC();
        this.ctx = c;
        const len = c.sampleRate;
        this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        // Everything goes through a gentle compressor so stacked gunfire does not clip.
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        comp.connect(c.destination);
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(comp);
        // A short generated room tail for guns and explosions.
        const ir = c.createBuffer(2, Math.floor(c.sampleRate * 1.4), c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        }
        const conv = c.createConvolver();
        conv.buffer = ir;
        this.verb = c.createGain();
        this.verb.gain.value = 0.22;
        this.verb.connect(conv).connect(this.master);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    },

    play(name, gap, fn) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      fn();
    },

    route(node, wet) {
      node.connect(this.master);
      if (wet) node.connect(this.verb);
    },

    tone(freq, dur, type, vol, slideTo, delay = 0, wet = false) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      this.route(g, wet);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    noise(dur, vol, freq, delay = 0, type = 'lowpass', wet = false, q = 0.7) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g);
      this.route(g, wet);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur);
    },

    // Layered gunshot: a sharp crack, a filtered body, a low thump and a room
    // tail, then the action cycling on pump and bolt guns.
    gun(w) {
      const p = w.snd;
      this.play('gun', 0.03, () => {
        this.noise(0.035, p.vol * 0.7, p.crack, 0, 'highpass');
        this.noise(p.dur, p.vol, p.body, 0, 'lowpass', true);
        this.tone(p.thump, 0.12, 'sine', p.vol * 0.8, 40);
        this.noise(p.dur * 2.2, p.vol * 0.18, 500, 0.02, 'lowpass', true);
        if (p.mech === 'pump') {
          this.noise(0.05, 0.12, 2400, 0.32, 'bandpass', false, 3);
          this.noise(0.06, 0.14, 1800, 0.46, 'bandpass', false, 3);
        } else if (p.mech === 'bolt') {
          this.noise(0.04, 0.1, 3200, 0.42, 'bandpass', false, 4);
          this.noise(0.05, 0.12, 2600, 0.58, 'bandpass', false, 4);
        }
      });
    },
    survivorShot() { this.play('sgun', 0.08, () => { this.noise(0.1, 0.09, 1300, 0, 'lowpass', true); this.tone(120, 0.06, 'sine', 0.06, 50); }); },
    empty() { this.play('empty', 0.2, () => this.tone(1800, 0.03, 'square', 0.04)); },
    reload() {
      this.play('reload', 0.3, () => {
        this.noise(0.05, 0.15, 3000, 0, 'bandpass', false, 2);
        this.noise(0.05, 0.15, 2500, 0.25, 'bandpass', false, 2);
      });
    },
    hit() { this.play('hit', 0.04, () => this.noise(0.06, 0.12, 700)); },
    headshot() { this.play('head', 0.05, () => { this.tone(2400, 0.06, 'triangle', 0.06); this.noise(0.08, 0.14, 900); }); },
    clank() { this.play('clank', 0.05, () => { this.tone(1300, 0.12, 'square', 0.05, 900); this.noise(0.05, 0.1, 5000); }); },
    groan() {
      this.play('groan', 1.2, () => this.tone(rand(70, 110), rand(0.6, 1.1), 'sawtooth', 0.025, rand(50, 70)));
    },
    scream() { this.play('scream', 0.8, () => this.tone(900, 0.7, 'sawtooth', 0.05, 400, 0, true)); },
    spit() { this.play('spit', 0.3, () => this.noise(0.15, 0.1, 900)); },
    splat() { this.play('splat', 0.15, () => this.noise(0.2, 0.15, 500)); },
    boom() {
      this.play('boom', 0.08, () => {
        this.noise(0.05, 0.4, 3000, 0, 'highpass');
        this.noise(0.8, 0.5, 380, 0, 'lowpass', true);
        this.tone(90, 0.5, 'sine', 0.35, 30);
      });
    },
    knock() { this.play('knock', 0.12, () => this.noise(0.12, 0.2, 400)); },
    crash() { this.play('crash', 0.3, () => { this.noise(0.6, 0.4, 700, 0, 'lowpass', true); this.tone(120, 0.4, 'sawtooth', 0.06, 40); }); },
    creak() { this.play('creak', 0.5, () => { this.tone(95, 0.6, 'sawtooth', 0.06, 60); this.noise(0.3, 0.2, 300, 0, 'lowpass', true); }); },
    hammer() { this.play('hammer', 0.35, () => { this.noise(0.04, 0.12, 2200, 0, 'bandpass', false, 2); this.tone(520, 0.04, 'square', 0.03); }); },
    hurt() { this.play('hurt', 0.3, () => this.tone(300, 0.2, 'square', 0.05, 120)); },
    crewHurt() { this.play('churt', 0.4, () => this.tone(420, 0.16, 'triangle', 0.06, 200)); },
    crewDown() {
      this.play('cdown', 1, () => [330, 294, 220].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.07, null, i * 0.22, true)));
    },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    deny() { this.play('deny', 0.1, () => this.tone(160, 0.1, 'square', 0.04)); },
    build() {
      this.play('build', 0.2, () => [0, 0.12, 0.24].forEach((d) => this.noise(0.06, 0.2, 1800, d)));
    },
    find() {
      this.play('find', 0.3, () => [660, 880].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, null, i * 0.1)));
    },
    flare() {
      this.play('flare', 0.2, () => {
        this.noise(0.6, 0.18, 1800, 0, 'bandpass', false, 1.5);
        this.tone(500, 0.6, 'triangle', 0.03, 1500);
        this.noise(0.25, 0.25, 900, 0.75, 'lowpass', true);
      });
    },
    thunder(delay) {
      this.play('thunder', 1, () => {
        this.noise(0.12, 0.3, 2500, delay, 'highpass');
        this.noise(2.8, 0.55, 220, delay, 'lowpass', true);
        this.tone(48, 2, 'sine', 0.25, 30, delay + 0.05);
      });
    },
    siren() {
      this.play('siren', 2, () => [0, 0.9].forEach((d) => this.tone(380, 0.85, 'sawtooth', 0.04, 720, d, true)));
    },
    heli() {
      this.play('heli', 4, () => { for (let k = 0; k < 40; k++) this.noise(0.06, 0.12 * Math.min(1, k / 12), 260, k * 0.09); });
    },
    dawn() {
      this.play('dawn', 1, () => [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.07, null, i * 0.15, true)));
    },
    win() {
      this.play('win', 2, () => [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.08, null, i * 0.18, true)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },

    // Looping rain or wind under the night. Called every frame; only acts on change.
    ambient(kind) {
      if (!this.ctx || kind === this.ambKind) return;
      const c = this.ctx;
      if (this.amb) {
        const old = this.amb;
        old.g.gain.setTargetAtTime(0, c.currentTime, 0.4);
        setTimeout(() => old.s.stop(), 2000);
        this.amb = null;
      }
      this.ambKind = kind;
      if (!kind || kind === 'clear') return;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = kind === 'fog' ? 'lowpass' : 'bandpass';
      f.frequency.value = kind === 'fog' ? 350 : 1600;
      f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(kind === 'storm' ? 0.11 : kind === 'rain' ? 0.07 : 0.05, c.currentTime, 0.8);
      s.connect(f).connect(g).connect(this.master);
      s.start();
      this.amb = { s, g };
    },
  };

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  // Pointer position (canvas coordinates) and trigger state.
  const input = { mx: 700, my: 380, down: false, over: false };
  let nextId = 1;

  function newGame() {
    state = {
      mode: 'playing', // 'menu' | 'playing' | 'paused' | 'over'
      phase: 'night', // 'night' | 'day' | 'results' | 'ending'
      night: 1,
      t: 0,
      sections: [],
      barricade: 0, // total of the sections, kept in sync
      hp: PLAYER_MAX,
      res: { materials: 20, meds: 1 },
      build: { tier: 0, wire: 0, spikes: 0, light: 0, flareKit: 0 },
      mines: [],
      guns: WEAPONS.map((w, i) => ({ owned: i === 0, mag: w.mag, reserve: i === 0 ? Infinity : 0 })),
      gun: 0,
      cd: 0,
      reloadT: 0,
      heat: 0,
      recoil: 0,
      flash: 0,
      flares: FLARES_BASE,
      bonusFlares: 0,
      flareCd: 0,
      flareObjs: [],
      survivors: [],
      fallen: [],
      bodies: [],
      recruited: 0,
      pity: 0,
      bloodMoon: false,
      weather: 'clear',
      special: null,
      zombies: [],
      corpses: [],
      spawns: [],
      acid: [],
      ladders: [],
      tracers: [],
      parts: [],
      splats: [],
      scorches: [],
      lights: [],
      rings: [],
      texts: [],
      rain: [],
      shake: 0,
      hitStop: 0,
      slowmo: 0,
      cleared: false,
      clearT: 0,
      hurtT: 0,
      sky: { flash: 0, next: 6, bolt: null },
      beam: { ang: 0.3, tx: 640, ty: 400 },
      stats: { kills: 0, headshots: 0, shots: 0, hits: 0, bosses: 0, flares: 0, ladders: 0, built: 0, bestNight: 0 },
      nightStats: null,
      plan: { repair: 4, scavenge: 6, search: 2, location: 'hardware' },
      lastPlan: null,
      results: [],
      introT: 0,
      banner: null,
      tab: { left: 'plan', right: 'build' },
      tut: !tutorialDone && !AUTOPLAY ? 0 : -1,
      tutT: 0,
      tutFlags: {},
      quipCd: 0,
      lastCalled: false,
      heli: null,
    };
    for (let i = 0; i < SECTIONS; i++) state.sections.push({ hp: secMax(), push: 0, hitT: 0, warned: false });
    syncBarricade();
    startNight();
  }

  // --- Barricade sections ---------------------------------------------------------

  function syncBarricade() {
    state.barricade = Math.round(state.sections.reduce((sum, s) => sum + s.hp, 0));
  }

  // Repairs go to the most damaged sections first.
  function repairWall(amount) {
    const max = secMax();
    let left = amount;
    for (let guard = 0; guard < 20 && left > 0.01; guard++) {
      const open = state.sections.filter((s) => s.hp < max - 0.01);
      if (!open.length) break;
      const low = Math.min(...open.map((s) => s.hp));
      const lows = open.filter((s) => s.hp <= low + 0.01);
      const higher = open.filter((s) => s.hp > low + 0.01).map((s) => s.hp);
      const level = higher.length ? Math.min(...higher) : max;
      const give = Math.min(left / lows.length, level - low);
      for (const s of lows) s.hp += give;
      left -= give * lows.length;
    }
    for (const s of state.sections) if (s.hp > max * 0.5) s.warned = false;
    syncBarricade();
    return Math.round(amount - left);
  }

  function hitSection(i, dmg, x, y) {
    if (state.mode !== 'playing') return;
    const sec = state.sections[i];
    if (sec.hp <= 0) return;
    sec.hp = Math.max(0, sec.hp - dmg);
    sec.hitT = 0.3;
    burst(x, y, '#a16207', fx(4), 80);
    Sound.knock();
    if (sec.hp === 0) {
      const my = secMidY(i);
      addText(wallX(my), my - 74, 'Breach!', '#f87171', 1.8);
      addShake(8);
      burst(wallX(my), my - 20, '#78350f', fx(30), 220);
      Sound.crash();
      crewSay(null, 'breach', true);
    } else if (sec.hp < secMax() * 0.25 && !sec.warned) {
      sec.warned = true;
      crewSay(null, 'low');
    }
    syncBarricade();
  }

  // A giant leaning on the wall shoves it back towards you.
  function shoveWall(i) {
    state.sections.forEach((s, k) => {
      const d = Math.abs(k - i);
      if (d <= 1) s.push = Math.min(34, s.push + (d ? 2 : 4.5));
    });
    const my = secMidY(i);
    burst(wallX(my) - 10, my, '#a8a29e', fx(10), 90);
    addShake(6);
    Sound.creak();
  }

  function damagePlayer(dmg) {
    if (state.mode !== 'playing') return;
    state.hp = Math.max(0, state.hp - dmg);
    state.hurtT = 0.5;
    addShake(5);
    Sound.hurt();
    if (state.hp <= 0) finish(false);
  }

  // ---------------------------------------------------------------------------
  // Nights
  // ---------------------------------------------------------------------------

  function buildWave(n, blood) {
    const horde = HORDE_NIGHTS.includes(n);
    const last = n === NIGHTS;
    // The last night's red moon is for show; it is big enough already.
    const count = Math.round((WAVE.base + n * WAVE.per) * (blood && !last ? 1.35 : 1) * (horde ? 1.3 : 1) * (last ? 1.2 : 1));
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
      // Spawns come in loose clumps rather than an even drip; a horde comes in three surges.
      const t = horde
        ? (0.06 + (k % 3) * 0.36) * duration + rand(0, duration * 0.16)
        : (Math.floor(k / 4) / Math.ceil(count / 4)) * duration + rand(0, 6);
      list.push({ t, type });
    }
    if (BOSS_NIGHTS.includes(n)) {
      if (last) list.push({ t: duration * 0.3, type: 'boss' }, { t: duration * 0.72, type: 'boss' });
      else list.push({ t: duration * 0.55, type: 'boss' });
    }
    const crews = SIEGE_NIGHTS[n] || 0;
    for (let i = 0; i < crews; i++) list.push({ t: duration * (0.2 + (0.55 * (i + 0.5)) / crews), type: 'ladder' });
    return list.sort((a, b) => a.t - b.t);
  }

  // The set piece a night brings, if any.
  const nightKind = (n) => (n === NIGHTS ? 'last' : BOSS_NIGHTS.includes(n) ? 'boss' : HORDE_NIGHTS.includes(n) ? 'horde'
    : SIEGE_NIGHTS[n] ? 'siege' : null);

  function startNight() {
    const n = state.night;
    state.phase = 'night';
    state.t = 0;
    state.cleared = false;
    state.clearT = 0;
    state.lastCalled = false;
    state.spawns = buildWave(n, state.bloodMoon);
    state.nightTotal = state.spawns.length;
    state.nightStats = { kills: 0, headshots: 0, barricade: state.barricade, crewLost: [] };
    state.flares = FLARES_BASE + FLARE_KIT[state.build.flareKit].extra + state.bonusFlares;
    state.bonusFlares = 0;
    state.flareObjs = [];
    state.ladders = [];
    state.introT = 3.5;
    state.sky = { flash: 0, next: rand(3, 7), bolt: null };
    state.special = nightKind(n);
    state.tab = { left: 'plan', right: 'build' };
    placeCrew(true);
    for (const s of state.survivors) {
      s.cd = rand(0.5, 1.5);
      s.quipCd = rand(1, 3);
      s.bubble = null;
    }
    if (state.special === 'horde' || state.special === 'last') Sound.siren();
    state.quipCd = 0;
    crewSay(null, state.special === 'horde' ? 'horde' : state.weather === 'rain' || state.weather === 'storm' ? 'storm' : 'start');
    state.quipCd = 1.5;
  }

  function spawnZombie(type, at) {
    const z = ZOMBIES[type];
    const n = state.night;
    const scale = (1 + WAVE.hp * (n - 1)) * (type === 'boss' ? 1 + 0.03 * Math.max(0, n - 10) : 1);
    const y = at ? at.y : type === 'boss' ? (FIELD_TOP + FIELD_BOT) / 2 + rand(-20, 20)
      : type === 'ladder' ? rand(FIELD_TOP + 14, FIELD_BOT - 14) : rand(FIELD_TOP, FIELD_BOT);
    const zombie = {
      id: nextId++,
      type, y,
      x: at ? at.x : W + rand(20, 60),
      hp: z.hp * scale,
      maxHp: z.hp * scale,
      helmet: z.helmet ? z.helmet * scale : 0,
      speed: z.speed * rand(0.85, 1.15) * (state.bloodMoon && n < NIGHTS ? 1.12 : 1),
      cd: 0,
      flash: 0,
      walk: rand(0, 6),
      attack: 0,
      rage: 0,
      burn: 0,
      lit: false,
      inside: false,
      climb: null,
      lift: 0,
      ladder: null,
      triedClimb: false,
      scream: rand(2, 4),
      spitX: rand(540, 660),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      skin: pick(SKINS),
      hair: Math.random() < 0.6,
      dead: false,
    };
    state.zombies.push(zombie);
    if (at) return zombie;
    if (type === 'boss') {
      addText(W - 120, FIELD_TOP - 60, 'Something huge is here', '#fca5a5', 2.5);
      Sound.scream();
      addShake(4);
      crewSay(null, 'boss', true);
    } else if (type === 'ladder') {
      addText(W - 110, FIELD_TOP - 40, 'Ladder crew!', '#fdba74', 2);
    } else if (Math.random() < 0.3) Sound.groan();
    return zombie;
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

  // Hitboxes in world coordinates; zombies further down the screen are closer
  // and bigger. Climbers are lifted off the ground.
  function geom(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const fy = z.y - z.lift;
    if (z.type === 'crawler') {
      return {
        s,
        body: [z.x - (t.w * s) / 2, fy - t.h * s, z.x + (t.w * s) / 2, fy],
        head: { x: z.x - (t.w * s) / 2 - 5 * s, y: fy - 11 * s, r: t.headR * s },
      };
    }
    const h = headLocal(t);
    const hx = z.type === 'ladder' ? z.x - 14 * s : z.x;
    const head = { x: hx + h.x * s, y: fy + h.y * s, r: h.r * s };
    return {
      s,
      body: [Math.min(z.x - (t.w * s) / 2, head.x), head.y + head.r * 0.8, z.x + (t.w * s) / 2, fy],
      head,
    };
  }

  function stopX(z) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const wx = wallX(z.y) + 34 * s + (t.w * s) / 2;
    return z.type === 'spitter' ? Math.max(z.spitX, wx) : wx;
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
      if (z.burn > 0) {
        z.burn -= dt;
        hurtZombie(z, 16 * dt * (1 + 0.05 * state.night), false, z.x, z.y, false, true);
        if (Math.random() < dt * (reduced() ? 10 : 24)) flame(z);
        if (z.dead) continue;
      }
      const speed = z.speed * (z.rage > 0 ? 1.6 : 1) * (z.burn > 0 ? 1.2 : 1);

      if (z.climb !== null) { updateClimb(z, s, dt); continue; }
      if (z.inside) { updateInside(z, t, s, speed, dt); continue; }

      const wx = wallX(z.y);
      let pace = speed;
      // Spike strip in front of the wall.
      if (spikes.dps && z.type !== 'crawler' && z.x > wx + 50 && z.x < wx + 125) {
        pace *= 1 - spikes.slow;
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

      // A broken section lets them straight through.
      const sec = state.sections[secOf(z.y)];
      if (sec.hp <= 0 && z.type !== 'spitter') {
        z.x -= pace * dt;
        z.walk += dt * pace * 0.12;
        z.moving = true;
        if (z.x < wx - 18 * s) z.inside = true;
        continue;
      }

      const sx = stopX(z);
      if (z.x > sx) {
        z.x = Math.max(sx, z.x - pace * dt);
        z.walk += dt * pace * 0.12;
        z.moving = true;
        continue;
      }
      z.moving = false;

      if (z.type === 'ladder') {
        plantLadder(z);
        continue;
      }
      // Most of the ones that can climb go up a planted ladder in their lane.
      if (!z.triedClimb && CLIMBERS.includes(z.type)) {
        z.triedClimb = true;
        const lad = state.ladders.find((l) => !l.down && Math.abs(l.y - z.y) < 30);
        if (lad && Math.random() < 0.75) {
          z.climb = 0;
          z.ladder = lad;
          continue;
        }
      }

      // Clawing at the wall hurts on barbed wire.
      if (wire.dps && z.type !== 'spitter') {
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
        z.hp = 0;
        killZombie(z, false, z.x, z.y);
        hitSection(secOf(z.y), t.dmg, wx, z.y - 20 * s);
      } else {
        hitSection(secOf(z.y), t.dmg, wx + 24 * s, z.y - 26 * s);
        if (z.type === 'boss') shoveWall(secOf(z.y));
      }
    }
    state.zombies = state.zombies.filter((z) => !z.dead);
  }

  // Up the ladder, over the top and down behind the wall.
  function updateClimb(z, s, dt) {
    const lad = z.ladder;
    if (!lad || lad.down) {
      // The ladder went down under them.
      z.climb = null;
      z.lift = 0;
      z.x = wallX(z.y) + 40 * s;
      hurtZombie(z, 30, false, z.x, z.y - 10, false);
      return;
    }
    z.climb += dt / 1.7;
    const wx = wallX(z.y);
    const top = (WALL.height + 4) * s;
    if (z.climb < 0) {
      z.x = wx + 32 * s;
      z.lift = 0;
      z.moving = false;
      return;
    }
    const c = Math.min(1, z.climb);
    if (c < 0.7) {
      const u = c / 0.7;
      z.x = wx + (32 - 26 * u) * s;
      z.lift = u * top;
    } else {
      const u = (c - 0.7) / 0.3;
      z.x = wx + (6 - 32 * u) * s;
      z.lift = (1 - u * u) * top;
    }
    z.moving = true;
    z.walk += dt * 5;
    if (z.climb >= 1) {
      z.climb = null;
      z.lift = 0;
      z.inside = true;
    }
  }

  // Behind the wall: go for the nearest crew member on duty, else the tower.
  function updateInside(z, t, s, speed, dt) {
    let target = null;
    let best = Infinity;
    for (const sv of activeCrew()) {
      const d = Math.hypot(sv.x - z.x, (sv.y - z.y) * 1.5);
      if (d < best) { best = d; target = sv; }
    }
    const tx = target ? target.x + 16 + (t.w * s) / 2 : PLAYER.x + 30 + (t.w * s) / 2;
    const ty = target ? target.y + 1 : clamp(z.y, FIELD_TOP + 6, FIELD_BOT);
    const dx = tx - z.x;
    const dy = ty - z.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const st = Math.min(d, speed * dt);
      z.x += (dx / d) * st;
      z.y += (dy / d) * st;
      z.walk += dt * speed * 0.12;
      z.moving = true;
      return;
    }
    z.moving = false;
    if (z.cd > 0) return;
    z.cd = t.rate * rand(0.9, 1.1);
    z.attack = 0.3;
    if (z.type === 'exploder') {
      z.hp = 0;
      killZombie(z, false, z.x, z.y);
    } else if (target) hurtSurvivor(target, t.dmg * 0.8);
    else damagePlayer(t.dmg * 0.5);
  }

  function plantLadder(z) {
    const s = depth(z.y);
    const lad = { y: z.y, hp: 70 * (1 + 0.06 * state.night), down: false, fall: 0 };
    lad.max = lad.hp;
    state.ladders.push(lad);
    z.dead = true; // the crew drop it against the wall and go up first
    for (let k = 0; k < 2; k++) {
      const c = spawnZombie('walker', { x: z.x + k * 12 * s, y: z.y });
      c.climb = -0.35 - k * 0.7;
      c.ladder = lad;
      c.triedClimb = true;
    }
    addText(wallX(z.y) + 20, z.y - 84 * s, 'Ladder up! Shoot it down', '#fdba74', 1.8);
    crewSay(null, 'ladder', true);
    Sound.clank();
    state.tutFlags.ladder = true;
  }

  // The ladder's foot and top, for drawing and hit tests.
  function ladderEnds(lad) {
    const d = depth(lad.y);
    const wx = wallX(lad.y);
    return { bx: wx + 44 * d, by: lad.y, tx: wx + 4 * d, ty: lad.y - (WALL.height + 10) * d, d };
  }

  function hurtLadder(lad, dmg, x, y) {
    lad.hp -= dmg;
    burst(x, y, '#a16207', fx(4), 110);
    Sound.clank();
    if (lad.hp <= 0 && !lad.down) {
      lad.down = true;
      state.stats.ladders++;
      addText(x, y - 16, 'Ladder down!', '#fde047', 1.2);
      burst(x, y, '#78350f', fx(14), 180);
    }
  }

  function updateLadders(dt) {
    for (const lad of state.ladders) if (lad.down) lad.fall += dt;
    state.ladders = state.ladders.filter((l) => l.fall < 1.2);
  }

  function scream(z) {
    const s = depth(z.y);
    state.rings.push({ x: z.x, y: z.y - 40 * s, r: 10, life: 0.8, max: 0.8 });
    for (const o of state.zombies) {
      if (o !== z && Math.hypot(o.x - z.x, (o.y - z.y) * 1.5) < 220) o.rage = 4;
    }
    Sound.scream();
  }

  // Acid is lobbed at the wall, at a crew member, or at you through a gap.
  function spit(z) {
    const g = geom(z);
    const crew = activeCrew();
    const target = crew.length && Math.random() < 0.28 ? pick(crew) : null;
    const ly = target ? target.y : rand(FIELD_TOP, FIELD_BOT);
    const sec = secOf(ly);
    const open = state.sections[sec].hp <= 0;
    let tx;
    let ty;
    if (target) {
      tx = target.x;
      ty = target.y - 34;
    } else if (open) {
      tx = PLAYER.x + 10;
      ty = PLAYER.y - 30;
    } else {
      tx = wallX(ly) + 6;
      ty = ly - 30 * depth(ly);
    }
    const T = 1.1;
    const gAcc = 500;
    state.acid.push({
      x: g.head.x, y: g.head.y,
      vx: (tx - g.head.x) / T,
      vy: (ty - g.head.y - 0.5 * gAcc * T * T) / T,
      g: gAcc, t: 0, T, dmg: ZOMBIES.spitter.dmg * (1 + 0.05 * state.night),
      target, sec, toPlayer: open && !target,
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
        burst(a.x, a.y, '#a3e635', fx(12), 120);
        Sound.splat();
        if (a.target) {
          if (state.survivors.includes(a.target)) hurtSurvivor(a.target, a.dmg * 0.7);
        } else if (a.toPlayer || state.sections[a.sec].hp <= 0) damagePlayer(a.dmg * 0.5);
        else hitSection(a.sec, a.dmg, a.x, a.y);
      }
    }
    state.acid = state.acid.filter((a) => !a.done);
  }

  function updateMines() {
    for (const m of state.mines) {
      for (const z of state.zombies) {
        if (z.dead || z.inside || z.lift > 0) continue;
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
    state.scorches.push({ x, y, r: radius * 0.6, t: 0 });
    if (state.scorches.length > 30) state.scorches.shift();
    state.lights.push({ x, y: y - 20, r: radius * 4, life: 0.4, max: 0.4 });
    state.rings.push({ x, y: y - 6, r: 8, life: 0.35, max: 0.35, color: '255, 237, 213', grow: 700 });
    for (let k = 0; k < fx(30); k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(60, 340);
      state.parts.push({
        x, y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 120,
        life: rand(0.3, 0.7), max: 0.7, color: pick(['#fbbf24', '#f97316', '#ef4444', '#fde68a']), size: rand(3, 6), floor: y + 10, glow: true,
      });
    }
    for (let k = 0; k < fx(12); k++) {
      state.parts.push({
        x: x + rand(-20, 20), y: y - rand(5, 30), vx: rand(-20, 20), vy: rand(-60, -20),
        life: rand(0.9, 1.6), max: 1.6, color: 'rgba(68,64,60,0.7)', size: rand(10, 22), floor: H, smoke: true,
      });
    }
    addShake(9);
    Sound.boom();
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - x, (z.y - y) * 1.6);
      if (d < radius) {
        hurtZombie(z, dmg * (1 - (0.5 * d) / radius), false, z.x, z.y - 20 * depth(z.y), false);
        if (!z.dead && z.type !== 'boss') z.burn = Math.max(z.burn, 3.5);
      }
    }
    // Crew at the wall catch the edge of a blast.
    for (const sv of activeCrew()) {
      const d = Math.hypot(sv.x - x, (sv.y - y) * 1.6);
      if (d < radius) hurtSurvivor(sv, 22 * (1 - d / radius));
    }
  }

  function hurtZombie(z, dmg, head, hx, hy, fromPlayer, quiet, by) {
    if (z.dead) return;
    if (!quiet && z.lit) dmg *= LIT_BONUS;
    z.hp -= dmg;
    if (!quiet) {
      z.flash = 0.08;
      if (z.type !== 'brute' && z.type !== 'boss' && z.type !== 'ladder' && !z.inside && z.climb === null) z.x += Math.min(6, dmg * 0.08);
      blood(hx, hy, head ? 8 : 4);
      if (fromPlayer) {
        if (head) Sound.headshot();
        else Sound.hit();
      }
    }
    if (z.hp <= 0) killZombie(z, head, hx, hy, fromPlayer, by);
  }

  function killZombie(z, head, hx, hy, fromPlayer, by) {
    if (z.dead) return;
    z.dead = true;
    state.stats.kills++;
    state.nightStats.kills++;
    if (by) by.kills++;
    if (head) {
      state.stats.headshots++;
      state.nightStats.headshots++;
      if (fromPlayer) {
        addText(hx, hy - 12, 'HEADSHOT', '#fde047', 0.8);
        state.hitStop = Math.max(state.hitStop, 0.045);
      }
      blood(hx, hy, fx(16));
    }
    if (by && Math.random() < 0.15) crewSay(by, head ? 'head' : 'kill');
    const s = depth(z.y);
    blood(z.x, z.y - z.lift - 20 * s, fx(10));
    // Gore decal on the road that slowly fades.
    if (!z.lift) {
      state.splats.push({ x: z.x + rand(-6, 6), y: z.y + rand(-2, 2), r: rand(8, 16) * s * (z.type === 'boss' ? 3 : 1), t: 0, rot: rand(-0.3, 0.3) });
      if (state.splats.length > 160) state.splats.shift();
    }
    if (z.type === 'brute' && fromPlayer) state.hitStop = Math.max(state.hitStop, 0.08);
    // The very last zombie of the night goes down in slow motion.
    const last = !state.spawns.length && state.zombies.every((o) => o.dead);
    if (last && state.phase === 'night') {
      state.slowmo = 1.4;
      state.hitStop = Math.max(state.hitStop, 0.08);
    }
    if (z.type === 'exploder') {
      explode(z.x, z.y, 80, 130);
      return;
    }
    state.corpses.push({ z, t: 0 });
    if (state.corpses.length > 45) state.corpses.shift();
    if (z.type === 'boss') {
      state.stats.bosses++;
      addShake(14);
      state.hitStop = Math.max(state.hitStop, 0.3);
      state.slowmo = Math.max(state.slowmo, 1.2);
      addText(z.x, z.y - 140, 'The giant falls', '#fde047', 2);
      for (let k = 0; k < fx(16); k++) {
        state.parts.push({
          x: z.x + rand(-40, 40), y: z.y - rand(0, 10), vx: rand(-40, 40), vy: rand(-50, -10),
          life: rand(1, 1.8), max: 1.8, color: 'rgba(120,113,108,0.5)', size: rand(14, 26), floor: H, smoke: true,
        });
      }
      Sound.boom();
    }
  }

  // --- Shooting --------------------------------------------------------------

  function rayCircle(ox, oy, dx, dy, c) {
    const fx0 = ox - c.x;
    const fy0 = oy - c.y;
    const b = fx0 * dx + fy0 * dy;
    const disc = b * b - (fx0 * fx0 + fy0 * fy0 - c.r * c.r);
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

  // Everything a ray passes through (zombies and ladders), nearest first.
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
    for (const lad of state.ladders) {
      if (lad.down) continue;
      const e = ladderEnds(lad);
      const t = rayRect(ox, oy, dx, dy, [e.tx - 4, e.ty, e.bx + 4, e.by]);
      if (t !== null) hits.push({ lad, t, x: ox + dx * t, y: oy + dy * t });
    }
    return hits.sort((a, b) => a.t - b.t);
  }

  const SHOULDER = { x: PLAYER.x + 3, y: PLAYER.y - 38 };

  function aimAngle() {
    return clamp(Math.atan2(input.my - SHOULDER.y, Math.max(20, input.mx - SHOULDER.x)), -1.1, 1.4);
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
      let pierced = 0;
      for (const h of hits) {
        if (pierced >= w.pierce) break;
        pierced++;
        anyHit = true;
        end = h;
        if (h.lad) {
          hurtLadder(h.lad, dmg, h.x, h.y);
          break;
        }
        if (h.head && h.z.helmet > 0) {
          // Helmets soak up headshots until they come off.
          h.z.helmet -= dmg;
          h.z.flash = 0.06;
          burst(h.x, h.y, '#e5e7eb', fx(6), 140);
          Sound.clank();
          if (h.z.helmet <= 0) {
            addText(h.x, h.y - 14, 'Helmet off', '#e5e7eb', 0.8);
            burst(h.x, h.y, '#1e3a8a', fx(10), 180);
          }
          break;
        }
        hurtZombie(h.z, dmg * (h.head ? HEADSHOT : 1), h.head, h.x, h.y, true);
        dmg *= 0.8;
      }
      const far = end ? end.t : 1400;
      state.tracers.push({
        x0: m.x, y0: m.y, x1: m.x + Math.cos(ang) * far, y1: m.y + Math.sin(ang) * far,
        life: 0.06, max: 0.06, color: '253, 230, 138', width: w.pellets > 1 ? 1 : 2,
      });
    }
    if (anyHit) state.stats.hits++;
    state.heat = Math.min(0.12, state.heat + w.bloom);
    const heavy = w.pellets > 1 || w.pierce > 1;
    state.recoil = Math.min(1, state.recoil + (heavy ? 1 : 0.35));
    state.flash = 0.05;
    // Muzzle flash lights up the whole street for a moment.
    state.lights.push({ x: m.x + Math.cos(m.ang) * 20, y: m.y, r: heavy ? 420 : 340, life: 0.07, max: 0.07 });
    addShake(heavy ? 3 : 1);
    casing(SHOULDER.x + 6, SHOULDER.y + 2, w.casing, PLAYER.y - 2);
    Sound.gun(w);
    state.tutFlags.shot = true;
    if (g.mag === 0 && g.reserve > 0) startReload();
  }

  function startReload() {
    const g = state.guns[state.gun];
    const w = WEAPONS[state.gun];
    if (state.reloadT > 0 || g.mag >= w.mag || g.reserve <= 0) return;
    state.reloadT = w.reload;
    state.tutFlags.reload = true;
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

  // --- Flares and the searchlight -------------------------------------------------

  // A flare arcs up towards the cursor, then drifts down under a little
  // parachute, lighting everything below it.
  function fireFlare(tx, ty) {
    if (state.phase !== 'night' || state.mode !== 'playing' || state.cleared) return false;
    if (state.flares <= 0 || state.flareCd > 0) {
      Sound.deny();
      return false;
    }
    state.flares--;
    state.flareCd = 0.4;
    state.stats.flares++;
    state.tutFlags.flare = true;
    state.flareObjs.push({
      x: SHOULDER.x, y: SHOULDER.y, sx: SHOULDER.x, sy: SHOULDER.y,
      tx: clamp(tx, 300, 960), ty: rand(96, 126), ground: clamp(ty, FIELD_TOP + 10, FIELD_BOT - 6),
      t: 0, T: 0.9, phase: 'rise', life: 15, sway: rand(0, 6),
    });
    Sound.flare();
    crewSay(null, 'flare');
    return true;
  }

  function updateFlares(dt) {
    for (const f of state.flareObjs) {
      f.t += dt;
      if (f.phase === 'rise') {
        const u = Math.min(1, f.t / f.T);
        f.x = f.sx + (f.tx - f.sx) * u;
        f.y = f.sy + (f.ty - f.sy) * (1 - (1 - u) * (1 - u));
        if (u >= 1) {
          f.phase = 'fall';
          burst(f.x, f.y, '#fecaca', fx(12), 120);
        }
      } else {
        f.life -= dt;
        if (f.phase === 'fall') {
          f.y += 17 * dt;
          f.x += Math.sin(f.t * 1.3 + f.sway) * 9 * dt;
          if (f.y >= f.ground) {
            f.phase = 'ground';
            f.y = f.ground;
            // Landing on someone sets them alight.
            for (const z of state.zombies) if (!z.dead && Math.hypot(z.x - f.x, z.y - f.y) < 30) z.burn = Math.max(z.burn, 3);
          }
        }
      }
      if (Math.random() < dt * (reduced() ? 12 : 30)) {
        state.parts.push({
          x: f.x + rand(-2, 2), y: f.y + 3, vx: rand(-20, 20), vy: rand(10, 60),
          life: rand(0.3, 0.8), max: 0.8, color: pick(['#fecaca', '#fca5a5', '#fde68a']), size: rand(1.5, 3), floor: FIELD_BOT + 10, glow: true,
        });
      }
    }
    state.flareObjs = state.flareObjs.filter((f) => f.life > 0);
  }

  // How strongly a flare lights the street, 0..1.
  const flarePower = (f) => (f.phase === 'rise' ? 0.4 : Math.min(1, f.life / 2.5)) * (0.9 + 0.1 * Math.sin(f.t * 23));

  function updateBeam(dt) {
    if (!state.build.light) return;
    const b = state.beam;
    let tx = 640 + 300 * Math.sin(state.t * 0.33);
    let ty = 400 + 55 * Math.sin(state.t * 0.71);
    if (state.build.light >= 2) {
      // The motorised light follows the biggest threat on the street.
      const big = state.zombies.filter((z) => !z.dead && !z.inside && z.x < W - 20).sort((a, c) => c.maxHp - a.maxHp)[0];
      if (big) {
        tx = big.x;
        ty = big.y - 10;
      }
    }
    const k = Math.min(1, dt * 2.2);
    b.tx += (tx - b.tx) * k;
    b.ty += (ty - b.ty) * k;
    b.ang = Math.atan2(b.ty - SEARCHLIGHT.y, b.tx - SEARCHLIGHT.x);
  }

  function isLit(z) {
    const cy = z.y - z.lift - 22 * depth(z.y);
    for (const f of state.flareObjs) if (Math.abs(z.x - f.x) < 185 * flarePower(f)) return true;
    if (state.build.light) {
      const a = Math.atan2(cy - SEARCHLIGHT.y, z.x - SEARCHLIGHT.x);
      const d = Math.hypot(z.x - state.beam.tx, z.y - state.beam.ty);
      if (Math.abs(a - state.beam.ang) < LIGHTS[state.build.light].width && d < 140) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // The crew
  // ---------------------------------------------------------------------------

  function pickTrait() {
    const ids = Object.keys(TRAITS);
    let r = Math.random() * ids.reduce((s, id) => s + TRAITS[id].weight, 0);
    for (const id of ids) {
      r -= TRAITS[id].weight;
      if (r < 0) return id;
    }
    return ids[0];
  }

  function addSurvivor(trait) {
    if (state.survivors.length >= MAX_SURVIVORS) return null;
    const taken = new Set([...state.survivors, ...state.fallen].map((s) => s.name));
    const free = NAMES.filter((n) => !taken.has(n));
    const sv = {
      id: nextId++,
      name: pick(free.length ? free : NAMES),
      trait: trait || pickTrait(),
      hp: CREW_MAX_HP,
      role: 'guard',
      kills: 0,
      joined: state.night,
      x: 150, y: 360, homeX: 150, homeY: 360,
      cd: 1, flash: 0, aim: 0, recoil: 0, quipCd: 2, bubble: null, hide: 0, work: 0, hurtT: 0, walking: false,
      jacket: pick(JACKETS), pants: pick(PANTS), skin: pick(CREW_SKINS), hat: pick(['cap', 'none', 'band', 'beanie', 'none']),
    };
    state.survivors.push(sv);
    state.recruited++;
    placeCrew(true);
    return sv;
  }

  const activeCrew = () => state.survivors.filter((sv) => sv.role !== 'rest');

  // Everyone on duty gets a firing spot on the platform behind the wall.
  function placeCrew(snap) {
    state.survivors.forEach((sv, k) => {
      sv.homeX = 150 + (k % 2) * 34;
      sv.homeY = FIELD_TOP + 26 + k * 30;
      if (snap) {
        sv.x = sv.homeX;
        sv.y = sv.homeY;
      }
    });
  }

  function moveTo(sv, tx, ty, speed, dt) {
    const dx = tx - sv.x;
    const dy = ty - sv.y;
    const d = Math.hypot(dx, dy);
    sv.walking = d > 2;
    if (d <= 2) return true;
    const st = Math.min(d, speed * dt);
    sv.x += (dx / d) * st;
    sv.y += (dy / d) * st;
    return false;
  }

  function crewSay(sv, kind, force, vars) {
    if (!state.survivors.length) return;
    if (!sv) {
      const pool = state.phase === 'night' ? activeCrew() : state.survivors;
      if (!pool.length) return;
      sv = pick(pool);
    }
    if (state.phase === 'night' && sv.role === 'rest') return;
    if (!force && (sv.quipCd > 0 || state.quipCd > 0)) return;
    let lines = kind === 'trait' ? TRAIT_QUIPS[sv.trait] : QUIPS[kind];
    if (!force && (kind === 'start' || kind === 'kill') && Math.random() < 0.4) lines = TRAIT_QUIPS[sv.trait];
    let text = pick(lines);
    for (const [k, v] of Object.entries(vars || {})) text = text.replace(`{${k}}`, v);
    // One speech bubble at a time keeps the wall readable.
    for (const o of state.survivors) o.bubble = null;
    sv.bubble = { text, life: 2.8, max: 2.8 };
    sv.quipCd = rand(8, 14);
    state.quipCd = 2;
  }

  function hurtSurvivor(sv, dmg) {
    if (sv.hp <= 0 || state.mode !== 'playing') return;
    sv.hp -= dmg * (sv.trait === 'coward' && sv.hide > 0 ? 0.5 : 1);
    sv.hurtT = 0.3;
    blood(sv.x, sv.y - 30, fx(6));
    Sound.crewHurt();
    if (sv.hp <= 0) killSurvivor(sv, `night ${state.night}`);
    else if (Math.random() < 0.35) crewSay(sv, 'hurt', true);
  }

  function killSurvivor(sv, where) {
    sv.hp = 0;
    state.survivors = state.survivors.filter((o) => o !== sv);
    state.fallen.push({ name: sv.name, trait: sv.trait, night: state.night, kills: sv.kills, where });
    if (state.nightStats) state.nightStats.crewLost.push(sv.name);
    placeCrew(false);
    if (state.phase !== 'night') return;
    state.bodies.push({ x: sv.x, y: sv.y, jacket: sv.jacket, pants: sv.pants, skin: sv.skin, t: 0 });
    addText(sv.x + 10, sv.y - 70, `${sv.name} is down!`, '#f87171', 2.4);
    Sound.crewDown();
    const other = pick(activeCrew());
    if (other) crewSay(other, 'grief', true, { name: sv.name });
  }

  function crewRepair(sv, dt) {
    const max = secMax();
    let best = -1;
    let low = 1;
    state.sections.forEach((s, i) => {
      if (s.hp < max - 1 && s.hp / max < low) {
        low = s.hp / max;
        best = i;
      }
    });
    if (best < 0) return false; // nothing to fix: pick up a gun instead
    const ty = secMidY(best) + (sv.id % 2 ? -7 : 7);
    const tx = wallX(ty) - 26 * depth(ty);
    if (!moveTo(sv, tx, ty, 85, dt)) return true;
    const rate = 2.5 * (sv.trait === 'mechanic' ? 2 : 1) * (1 + 0.2 * state.build.tier);
    const sec = state.sections[best];
    sec.hp = Math.min(max, sec.hp + rate * dt);
    if (sec.hp > max * 0.5) sec.warned = false;
    syncBarricade();
    sv.work += dt;
    if (Math.random() < dt * 2.5) {
      burst(wallX(ty) - 4, ty - 26, pick(['#fde68a', '#a16207']), 2, 70);
      Sound.hammer();
    }
    if (Math.random() < dt * 0.15) crewSay(sv, 'repair');
    return true;
  }

  function updateSurvivors(dt) {
    const inside = state.zombies.filter((z) => !z.dead && z.inside);
    for (const sv of state.survivors) {
      sv.flash -= dt;
      sv.cd -= dt;
      sv.quipCd -= dt;
      sv.recoil = Math.max(0, sv.recoil - dt * 6);
      if (sv.role === 'rest') continue;
      const tr = TRAITS[sv.trait];
      if (sv.role === 'repair' && crewRepair(sv, dt)) continue;
      moveTo(sv, sv.homeX, sv.homeY, 70, dt);
      // Cowards duck behind the sandbags when it gets scary.
      if (sv.trait === 'coward') {
        const scary = inside.length > 0 || state.zombies.some((z) => !z.dead && z.x < wallX(z.y) + 80 && Math.abs(z.y - sv.y) < 45);
        if (scary && sv.hide <= 0) crewSay(sv, 'trait');
        if (scary) sv.hide = 1.2;
        sv.hide -= dt;
        if (sv.hide > 0) continue;
      }
      if (sv.cd > 0) continue;
      // Anything that got over the wall first, then whatever is closest.
      let target = inside.sort((a, b) => Math.hypot(a.x - sv.x, a.y - sv.y) - Math.hypot(b.x - sv.x, b.y - sv.y))[0];
      if (!target) target = state.zombies.filter((z) => !z.dead && z.x < W - 10).sort((a, b) => a.x - b.x)[0];
      if (!target) continue;
      sv.cd = rand(tr.cd[0], tr.cd[1]) * (sv.role === 'scavenge' ? 1.35 : 1);
      sv.flash = 0.05;
      sv.recoil = 1;
      const g = geom(target);
      const ox = sv.x + 20;
      const oy = sv.y - 36;
      const aimHead = Math.random() < tr.head && !(target.helmet > 0);
      const tx = aimHead ? g.head.x : target.x;
      const ty = aimHead ? g.head.y : (g.body[1] + g.body[3]) / 2;
      sv.aim = Math.atan2(ty - oy, tx - ox);
      state.lights.push({ x: ox, y: oy, r: 170, life: 0.05, max: 0.05 });
      casing(sv.x + 2, sv.y - 34, TRAITS[sv.trait].gun === 'shotgun' ? '#b91c1c' : '#d4a017', sv.y - 1);
      Sound.survivorShot();
      const acc = tr.acc * (sv.hp < 40 ? 0.7 : 1) + (target.lit ? 0.1 : 0);
      if (Math.random() < acc) {
        hurtZombie(target, tr.dmg * (aimHead ? HEADSHOT : 1) * (1 + 0.04 * state.night), aimHead, tx, ty, false, false, sv);
        state.tracers.push({ x0: ox, y0: oy, x1: tx, y1: ty, life: 0.05, max: 0.05, color: '253, 230, 138', width: 1 });
      } else {
        state.tracers.push({ x0: ox, y0: oy, x1: tx + rand(-30, 30), y1: ty - rand(20, 60), life: 0.05, max: 0.05, color: '253, 230, 138', width: 1 });
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
    state.flareCd -= dt;
    state.quipCd -= dt;
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

    updateBeam(dt);
    updateFlares(dt);
    for (const z of state.zombies) z.lit = isLit(z);
    updateSurvivors(dt);
    updateMines();
    updateZombies(dt);
    updateAcid(dt);
    updateLadders(dt);
    for (const s of state.sections) s.hitT -= dt;
    if (Math.random() < dt * 0.15 * Math.min(4, state.zombies.length)) Sound.groan();
    tutorialTick(dt);

    const alive = state.zombies.length;
    if (!state.spawns.length && alive === 1 && !state.lastCalled && state.nightTotal > 3) {
      state.lastCalled = true;
      crewSay(null, 'last', true);
    }
    if (state.mode !== 'playing') return;
    if (!state.spawns.length && !alive && !state.acid.length) {
      if (!state.cleared) {
        // A short breather before the sun comes up.
        state.cleared = true;
        state.clearT = 2.4;
        state.banner = { text: state.night >= NIGHTS ? 'You held the line' : `Night ${state.night} survived`, sub: 'The sun is coming up', life: 2.4, max: 2.4, color: '#fde68a' };
        Sound.dawn();
        crewSay(null, 'dawn', true);
      } else {
        state.clearT -= dt;
        if (state.clearT <= 0) endNight();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Days
  // ---------------------------------------------------------------------------

  function endNight() {
    const n = state.nightStats;
    const lost = Math.max(0, n.barricade - state.barricade);
    state.results = [
      { text: `Night ${state.night} survived.`, tone: 'good' },
      { text: `${n.kills} zombies killed, ${n.headshots} with headshots.` },
      { text: lost > 0 ? `The barricade took ${lost} damage.` : 'The barricade held without a scratch.' },
    ];
    if (n.crewLost.length) state.results.push({ text: `Lost tonight: ${n.crewLost.join(', ')}.`, tone: 'bad', big: true });
    state.stats.bestNight = Math.max(state.stats.bestNight, n.kills);
    if (state.night >= NIGHTS) {
      finish(true);
      return;
    }
    if (state.sections.some((s) => s.push > 0)) {
      state.results.push({ text: 'You heaved the barricade back into place.' });
    }
    for (const s of state.sections) s.push = 0;
    state.night++;
    state.phase = 'day';
    state.bloodMoon = false;
    state.weather = 'clear';
    state.hp = Math.min(PLAYER_MAX, state.hp + 15);
    state.plan = defaultPlan();
    state.splats = state.splats.slice(-50);
    state.corpses = [];
    state.bodies = [];
    state.ladders = [];
    state.flareObjs = [];
    state.scorches = state.scorches.slice(-8);
    state.tab = { left: 'plan', right: 'build' };
    for (const sv of state.survivors) sv.bubble = null;
    if (AUTOPLAY) {
      autoRoles();
      autoBuild();
      spendDay();
    }
  }

  // Guards lend a hand with repairs by day; repairers (mechanics most of all) a lot more.
  function crewRepairBonus() {
    return state.survivors.reduce((b, sv) => b + (sv.role === 'repair' ? (sv.trait === 'mechanic' ? 0.9 : 0.5) : sv.role === 'guard' ? 0.15 : 0), 0);
  }
  const repairPerHour = () => Math.round((30 + 12 * state.build.tier) * (1 + crewRepairBonus()));

  function defaultPlan() {
    const need = Math.ceil((tier().max - state.barricade) / repairPerHour());
    const repair = clamp(need, 0, 10);
    const rest = DAY_HOURS - repair;
    const search = state.survivors.length < MAX_SURVIVORS ? Math.floor(rest / 3) : 0;
    let location = state.plan ? state.plan.location : 'hardware';
    if (AUTOPLAY) {
      const missingGun = state.guns.some((g) => !g.owned);
      if (state.hp < 55 && state.res.meds === 0) location = 'hospital';
      else if (state.night >= 8 && state.hp >= 70 && state.night % 4 === 0) location = 'army';
      else if (missingGun && state.hp >= 55 && state.night % 2 === 0) location = 'police';
      else if (state.night % 3 === 0) location = 'police';
      else location = 'hardware';
    }
    return { repair, scavenge: rest - search, search, location };
  }

  // Yesterday's hours, place and crew roles, adjusted to what is possible today.
  function repeatPlan() {
    const lp = state.lastPlan;
    if (!lp) return false;
    const p = { repair: lp.repair, scavenge: lp.scavenge, search: lp.search, location: lp.location };
    if (state.survivors.length >= MAX_SURVIVORS) {
      p.scavenge += p.search;
      p.search = 0;
    }
    state.plan = p;
    for (const sv of state.survivors) if (lp.roles[sv.id]) sv.role = lp.roles[sv.id];
    return true;
  }

  // One scavenging run: loot per hour, injuries, and at most one event.
  function runScavenge(loc, hours, lines) {
    const place = LOCATIONS.find((l) => l.id === loc);
    const crew = state.survivors.filter((sv) => sv.role === 'scavenge');
    const loot = 1 + crew.reduce((b, sv) => b + (sv.trait === 'scavenger' ? 0.6 : 0.3), 0);
    let mats = 0;
    let meds = 0;
    let hurt = 0;
    const ammo = {};
    const crewHurt = new Map();
    const ownedGuns = () => state.guns.map((g, i) => i).filter((i) => i > 0 && state.guns[i].owned);
    const addAmmo = (share, prefer) => {
      const owned = ownedGuns();
      if (!owned.length) return false;
      const i = prefer && owned.includes(prefer) ? prefer : pick(owned);
      const amount = Math.ceil(WEAPONS[i].find * share * loot);
      state.guns[i].reserve += amount;
      ammo[i] = (ammo[i] || 0) + amount;
      return true;
    };
    const findGun = (chance) => {
      const next = state.guns.findIndex((g) => !g.owned);
      if (next < 0 || Math.random() >= chance + state.pity + 0.02 * crew.length) {
        if (next >= 0) state.pity += loc === 'police' || loc === 'army' ? 0.035 : 0.01;
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
    // An injury lands on you or on someone who came along.
    const injure = (amount) => {
      if (crew.length && Math.random() < 0.5) {
        const sv = pick(crew);
        const k = sv.trait === 'scavenger' ? 0.5 : sv.trait === 'coward' ? 0.3 : 1;
        crewHurt.set(sv, (crewHurt.get(sv) || 0) + Math.round(amount * k));
      } else hurt += amount;
    };

    for (let h = 0; h < hours; h++) {
      if (loc === 'hardware') {
        mats += randInt(6, 10);
      } else if (loc === 'police') {
        if (!findGun(0.1) && (Math.random() >= 0.85 || !addAmmo(0.5))) mats += 2;
      } else if (loc === 'hospital') {
        if (Math.random() < 0.35) meds++;
        else mats += 3;
      } else if (loc === 'army') {
        if (!findGun(0.12)) {
          const r = Math.random();
          if (r < 0.5 && addAmmo(0.6, 4)) {
            // ammo found
          } else if (r < 0.7) state.bonusFlares = Math.min(4, state.bonusFlares + 1);
          else mats += 4;
        }
      } else {
        mats += 3;
        if (Math.random() < 0.4) addAmmo(0.25);
        if (Math.random() < 0.12) meds++;
        findGun(0.04);
      }
      if (Math.random() < place.risk * (crew.length ? 0.85 : 1)) injure(randInt(8, 18));
    }
    mats = Math.round(mats * loot);
    if (loot > 1.5 && meds && Math.random() < 0.5) meds++;

    // Random event.
    if (hours >= 2 && Math.random() < 0.32) {
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
          const sv = addSurvivor();
          if (!sv) return;
          lines.push({ text: `${sv.name} the ${TRAITS[sv.trait].label.toLowerCase()} was hiding inside and asked to join you.`, tone: 'good', big: true });
        },
        () => {
          state.bonusFlares = Math.min(4, state.bonusFlares + 2);
          lines.push({ text: 'A box of road flares, still sealed (+2 flares tonight).', tone: 'good' });
        },
      ];
      if (loc === 'police' || loc === 'hospital' || loc === 'army') {
        events.push(() => {
          const dmg = randInt(15, 25);
          injure(dmg);
          lines.push({ text: `Ambushed inside the ${place.name.toLowerCase()}!`, tone: 'bad' });
        });
      }
      if (loc === 'hospital' || loc === 'market') {
        events.push(() => {
          meds++;
          lines.push({ text: 'You found a sealed first-aid cabinet (+1 medkit).', tone: 'good' });
        });
      }
      if (loc === 'hardware' || loc === 'army') {
        events.push(() => {
          lines.push({ text: 'A horde shuffled past while you hid in the dark. You lost an hour.', tone: 'bad' });
          mats = Math.round(mats * 0.85);
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
    const who = crew.length ? ` (with ${crew.map((sv) => sv.name).join(' and ')})` : '';
    lines.push({ text: found.length ? `${place.name}${who}: ${found.join(', ')}.` : `${place.name}${who}: nothing useful.` });
    if (hurt) {
      state.hp = Math.max(1, state.hp - hurt);
      lines.push({ text: `You were hurt while scavenging (-${hurt} health).`, tone: 'bad' });
    }
    for (const [sv, dmg] of crewHurt) {
      sv.hp -= dmg;
      if (sv.hp <= 0) {
        killSurvivor(sv, `a run to the ${place.short.toLowerCase()}`);
        lines.push({ text: `${sv.name} didn't make it back from the ${place.name.toLowerCase()}.`, tone: 'bad', big: true });
      } else lines.push({ text: `${sv.name} was hurt on the run (-${dmg} health).`, tone: 'bad' });
    }
    // Someone who came along has something to say about it.
    const talker = crew.find((sv) => state.survivors.includes(sv));
    if (talker) {
      const mood = crewHurt.size || hurt ? 'hurt' : found.length ? 'loot' : 'empty';
      lines.push({ text: `${talker.name}: "${pick(DAY_QUIPS[mood])}"`, tone: 'quote' });
    }
  }

  function chooseWeather() {
    const n = state.night;
    if (n >= NIGHTS) return 'storm';
    if (n <= 2) return 'clear';
    const r = Math.random();
    if (state.bloodMoon) return r < 0.4 ? 'fog' : 'clear';
    return r < 0.45 ? 'clear' : r < 0.65 ? 'rain' : r < 0.82 ? 'fog' : 'storm';
  }

  function spendDay() {
    const p = state.plan;
    const lines = [];
    const roles = {};
    for (const sv of state.survivors) roles[sv.id] = sv.role;
    state.lastPlan = { ...p, roles };
    if (p.repair) {
      const before = state.barricade;
      repairWall(p.repair * repairPerHour());
      lines.push({ text: `Repairs restored ${state.barricade - before} barricade (${state.barricade}/${tier().max}).` });
    }
    if (p.scavenge) runScavenge(p.location, p.scavenge, lines);
    let joined = 0;
    for (let h = 0; h < p.search && state.survivors.length < MAX_SURVIVORS; h++) {
      if (Math.random() < 0.1) {
        const sv = addSurvivor();
        joined++;
        lines.push({ text: `${sv.name} the ${TRAITS[sv.trait].label.toLowerCase()} joined you. ${TRAITS[sv.trait].desc}.`, tone: 'good', big: true });
      }
    }
    if (joined) Sound.find();
    else if (p.search) lines.push({ text: 'No survivors found today.' });

    // Rest and first aid.
    const medic = state.survivors.find((sv) => sv.trait === 'medic');
    for (const sv of state.survivors) {
      sv.hp = Math.min(CREW_MAX_HP, sv.hp + (sv.role === 'rest' ? 60 : 15) + (medic ? 15 : 0));
    }
    if (medic) {
      state.hp = Math.min(PLAYER_MAX, state.hp + 10);
      lines.push({ text: `${medic.name} patched everyone up.` });
    }

    // Warnings about the coming night.
    const n = state.night;
    if (n === NIGHTS) {
      state.bloodMoon = true;
      lines.push({ text: 'The last night. Everything left in the city is coming for you. Rescue arrives at dawn.', tone: 'warn', big: true });
    } else if (BOSS_NIGHTS.includes(n)) {
      lines.push({ text: 'The ground shakes in the distance. Something huge is coming tonight.', tone: 'warn', big: true });
    } else if (HORDE_NIGHTS.includes(n)) {
      lines.push({ text: 'Sirens wail across the city. A horde is on its way.', tone: 'warn', big: true });
    } else if (n >= 6 && Math.random() < 0.22) {
      state.bloodMoon = true;
      lines.push({ text: 'The moon is turning red. Tonight will be worse.', tone: 'warn', big: true });
    }
    if (SIEGE_NIGHTS[n] && n !== NIGHTS) lines.push({ text: 'You saw them dragging ladders. Shoot the ladders down before they climb over.', tone: 'warn' });
    state.weather = chooseWeather();
    const forecast = { rain: 'Rain is rolling in for the night.', fog: 'A thick fog is creeping in.', storm: 'A thunderstorm is coming.' }[state.weather];
    if (forecast) lines.push({ text: forecast });
    state.results = lines;
    state.phase = 'results';
    state.tab.left = 'report';
    if (AUTOPLAY) {
      autoBuild();
      startNight();
    }
  }

  // --- Building ----------------------------------------------------------------

  function buildRows() {
    const b = state.build;
    const next = TIERS[b.tier + 1];
    const m = state.res.materials;
    const kit = FLARE_KIT[b.flareKit + 1];
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
        desc: 'Explodes and sets fire to whatever steps on it',
        cost: state.mines.length < MAX_MINES ? MINE.cost : null,
        ok: state.mines.length < MAX_MINES && m >= MINE.cost,
      },
      {
        id: 'light',
        name: b.light === 0 ? 'Watchtower searchlight' : b.light === 1 ? 'Motorised searchlight' : 'Motorised searchlight',
        desc: b.light === 0 ? `Sweeps the street; lit zombies take +${Math.round((LIT_BONUS - 1) * 100)}% damage`
          : b.light === 1 ? 'Wider beam that tracks the biggest threat' : 'Tracks the biggest threat (max)',
        cost: b.light < 2 ? LIGHTS[b.light + 1].cost : null,
        ok: b.light < 2 && m >= LIGHTS[b.light + 1].cost,
      },
      {
        id: 'flares',
        name: `Flare kit (${FLARES_BASE + FLARE_KIT[b.flareKit].extra} per night)`,
        desc: kit ? `${FLARES_BASE + FLARE_KIT[b.flareKit].extra} → ${FLARES_BASE + kit.extra} flares every night` : 'Fully stocked (max)',
        cost: kit ? kit.cost : null,
        ok: !!kit && m >= kit.cost,
      },
      {
        id: 'medkit',
        name: `Medkit (you have ${state.res.meds})`,
        desc: 'Heals you for 50',
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
    state.stats.built++;
    if (id === 'tier') {
      const gain = (TIERS[b.tier + 1].max - tier().max) / SECTIONS;
      b.tier++;
      for (const s of state.sections) s.hp += gain;
      syncBarricade();
    } else if (id === 'wire') b.wire++;
    else if (id === 'spikes') b.spikes++;
    else if (id === 'light') b.light++;
    else if (id === 'flares') b.flareKit++;
    else if (id === 'mine') {
      state.mines.push({ x: rand(WALL.x + 130, 760), y: rand(FIELD_TOP + 6, FIELD_BOT - 6), blink: rand(0, 1) });
    }
    Sound.build();
    return true;
  }

  // Use a medkit on a crew member.
  function healCrew(id) {
    const sv = state.survivors.find((o) => o.id === id);
    if (!sv || state.res.meds <= 0 || sv.hp >= CREW_MAX_HP) {
      Sound.deny();
      return false;
    }
    state.res.meds--;
    sv.hp = Math.min(CREW_MAX_HP, sv.hp + 50);
    Sound.find();
    return true;
  }

  // --- Armory: trade materials for guns and ammo ------------------------------------

  function armoryRows() {
    const m = state.res.materials;
    return WEAPONS.map((w, i) => ({ w, i, g: state.guns[i] })).slice(1).map(({ w, i, g }) => {
      if (g.owned) return { id: `ammo:${i}`, i, w, owned: true, cost: w.packCost, label: `+${w.pack} ammo · ${w.packCost}`, ok: m >= w.packCost };
      const locked = state.night < w.from;
      return { id: `buy:${i}`, i, w, owned: false, cost: w.buy, label: locked ? `Night ${w.from}+` : `Buy · ${w.buy}`, ok: !locked && m >= w.buy, locked };
    });
  }

  function doArmory(id) {
    const row = armoryRows().find((r) => r.id === id);
    if (!row || !row.ok) {
      Sound.deny();
      return false;
    }
    state.res.materials -= row.cost;
    const g = state.guns[row.i];
    if (row.owned) g.reserve += row.w.pack;
    else {
      g.owned = true;
      g.mag = row.w.mag;
      g.reserve = row.w.find;
    }
    Sound.build();
    return true;
  }

  // Numbers for the weapon comparison bars.
  const gunStats = (w) => ({
    dps: (w.dmg * w.pellets) / w.rate,
    power: w.dmg * w.pellets * (w.pierce > 1 ? 1.5 : 1),
    mag: w.mag,
    reload: w.reload,
  });

  function bestOwnedGun() {
    let best = WEAPONS[0];
    state.guns.forEach((g, i) => {
      if (g.owned && gunStats(WEAPONS[i]).dps > gunStats(best).dps) best = WEAPONS[i];
    });
    return best;
  }

  // --- Autoplay: sensible spending and roles in a fixed priority order ---------------

  function autoRoles() {
    for (const sv of state.survivors) {
      if (sv.hp < 45) sv.role = 'rest';
      else if (sv.trait === 'mechanic') sv.role = 'repair';
      else if (sv.trait === 'scavenger' && state.plan.scavenge > 0) sv.role = 'scavenge';
      else sv.role = 'guard';
    }
  }

  function autoBuild() {
    if (state.hp < 60 && state.res.meds > 0) doBuild('medkit');
    for (const sv of state.survivors) if (sv.hp < 40 && state.res.meds > 1) healCrew(sv.id);
    // Keep the best guns fed, spending up to half the materials on ammo.
    if (state.night >= 4) {
      const budget = state.res.materials / 2;
      const spent = state.res.materials;
      const ranked = state.guns.map((g, i) => i).filter((i) => i > 0 && state.guns[i].owned)
        .sort((a, b) => gunStats(WEAPONS[b]).dps - gunStats(WEAPONS[a]).dps);
      for (const i of ranked) {
        for (let k = 0; k < 6 && state.guns[i].reserve < WEAPONS[i].find * 1.5; k++) {
          if (spent - state.res.materials + WEAPONS[i].packCost > budget || !doArmory(`ammo:${i}`)) break;
        }
      }
    }
    const order = ['tier', 'wire', 'spikes', 'mine', 'mine', 'light', 'flares', 'wire', 'spikes', 'tier', 'mine', 'mine',
      'wire', 'flares', 'light', 'mine', 'mine', 'mine', 'mine'];
    let done = true;
    for (const id of order) {
      const row = buildRows().find((r) => r.id === id);
      if (row.ok) doBuild(id);
      else if (row.cost !== null) { done = false; break; }
    }
    if (!done) return;
    // Then the armory: the next gun, or ammo for the best one.
    for (const row of armoryRows()) {
      if (!row.owned && row.ok && state.res.materials >= row.cost + 30) doArmory(row.id);
    }
    const best = WEAPONS.indexOf(bestOwnedGun());
    if (best > 0 && state.guns[best].reserve < WEAPONS[best].find && state.res.materials > 50) doArmory(`ammo:${best}`);
  }

  function finish(won) {
    state.mode = 'over';
    state.won = won;
    input.down = false;
    const run = { night: won ? NIGHTS : state.night, kills: state.stats.kills, won, of: NIGHTS };
    state.prevBest = loadBest();
    saveBest(run);
    if (won) {
      state.phase = 'ending';
      state.heli = { x: W + 160, y: 150, t: 0 };
      Sound.win();
      Sound.heli();
    } else Sound.lose();
    showOverlay(won ? 'ending' : 'over');
  }

  // Autoplay: a rough stand-in for a human. It picks a target (anything over
  // the wall, ladders, spitters and nearby exploders first, otherwise the
  // zombie closest to the wall), reacts after a short delay, moves the mouse
  // at a limited speed with some wobble, and only fires once the crosshair is
  // roughly on target. It fires a flare when a crowd builds up.
  const bot = { target: null, react: 0, ox: 0, oy: 0 };

  function botPriority(z) {
    let score = z.x;
    if (z.inside || z.climb !== null) score -= 600;
    if (z.type === 'ladder') score -= 300;
    if (z.type === 'spitter' && !z.moving) score -= 350;
    if (z.type === 'exploder' && z.x < wallX(z.y) + 220) score -= 250;
    if (z.type === 'screamer') score -= 120;
    return score;
  }

  function autoAim(dt) {
    // Save the big guns for when zombies are close or numerous.
    const owned = state.guns.map((g, i) => i).filter((i) => state.guns[i].owned && state.guns[i].mag + state.guns[i].reserve > 0);
    const nearest = Math.min(...state.zombies.map((z) => z.x), W);
    const danger = nearest < 480 || state.zombies.length > 10 || state.zombies.some((z) => z.type === 'boss' || z.inside);
    const want = danger ? owned[owned.length - 1] : 0;
    if (want !== state.gun && state.reloadT <= 0) switchGun(want);
    const crowd = state.zombies.filter((z) => z.x < 760 && !z.inside);
    if (crowd.length >= 8 && state.flares > 0 && !state.flareObjs.length) {
      fireFlare(crowd.reduce((s, z) => s + z.x, 0) / crowd.length, 400);
    }
    const ladder = state.ladders.find((l) => !l.down);
    const insiders = state.zombies.some((z) => z.inside || z.climb !== null);
    if (!bot.target || bot.target.dead || !state.zombies.includes(bot.target) || (bot.target.type !== 'boss' && ladder && !insiders)) {
      bot.target = state.zombies.filter((z) => !z.dead && z.x < W - 20).sort((a, b) => botPriority(a) - botPriority(b))[0] || null;
      bot.react = rand(0.2, 0.35);
      bot.ox = rand(-AIM_ERROR, AIM_ERROR);
      bot.oy = rand(-AIM_ERROR, AIM_ERROR) + AIM_ERROR * 0.5;
    }
    input.down = false;
    let tx;
    let ty;
    if (ladder && !insiders) {
      const e = ladderEnds(ladder);
      tx = (e.tx + e.bx) / 2 + bot.ox * 0.3;
      ty = (e.ty + e.by) / 2 + bot.oy * 0.3;
    } else {
      if (!bot.target) return;
      bot.react -= dt;
      if (bot.react > 0) return;
      const g = geom(bot.target);
      // Shoot helmets in the body.
      const aimBody = bot.target.helmet > 0;
      tx = (aimBody ? bot.target.x : g.head.x) + bot.ox;
      ty = (aimBody ? (g.body[1] + g.body[3]) / 2 : g.head.y) + bot.oy;
    }
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

  function addShake(v) {
    if (settings.shake) state.shake = Math.max(state.shake, v);
  }

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

  // Flames licking up off a burning zombie.
  function flame(z) {
    const g = geom(z);
    state.parts.push({
      x: rand(g.body[0], g.body[2]), y: rand(g.body[1], g.body[3]), vx: rand(-10, 10), vy: rand(-80, -35),
      life: rand(0.25, 0.55), max: 0.55, color: pick(['#fbbf24', '#f97316', '#ef4444', '#fde68a']), size: rand(3, 6), floor: H, flame: true, glow: true,
    });
  }

  // A spent shell that spins away and bounces on the platform.
  function casing(x, y, color, floor) {
    if (reduced() && Math.random() < 0.5) return;
    state.parts.push({
      x, y, vx: rand(-90, -30), vy: rand(-170, -90), life: 2.2, max: 2.2, color, size: 3, floor,
      casing: true, rot: rand(0, 6), vr: rand(-22, 22),
    });
  }

  function addText(x, y, text, color, life = 0.8) {
    state.texts.push({ x, y, text: String(text), color, life, max: life });
  }

  function makeBolt() {
    const pts = [];
    let x = rand(330, 980);
    let y = BAR;
    const end = rand(170, 240);
    while (y < end) {
      pts.push([x, y]);
      x += rand(-22, 22);
      y += rand(12, 26);
    }
    pts.push([x, end]);
    const k = Math.floor(pts.length / 2);
    const branch = [pts[k]];
    let [bx, by] = pts[k];
    for (let i = 0; i < 4; i++) {
      bx += rand(8, 24) * (Math.random() < 0.5 ? -1 : 1);
      by += rand(10, 20);
      branch.push([bx, by]);
    }
    return { pts, branch };
  }

  // Lightning brightness, 0..1, with a flicker; much gentler with reduced effects.
  function lightning() {
    const f = state.sky.flash;
    return (f > 0.55 && f < 0.7 ? 0.2 : f) * (reduced() ? 0.25 : 1);
  }

  function updateWeather(dt) {
    const wet = state.phase === 'night' && (state.weather === 'rain' || state.weather === 'storm');
    if (!wet) {
      state.rain.length = 0;
    } else {
      const want = Math.round((state.weather === 'storm' ? 240 : 150) * (reduced() ? 0.35 : 1));
      const slant = state.weather === 'storm' ? -230 : -110;
      const drop = (y) => ({ x: rand(-40, W + 120), y, vx: slant, vy: rand(720, 920), floor: rand(FIELD_TOP - 30, H), len: rand(10, 18) });
      while (state.rain.length < want) state.rain.push(drop(rand(BAR, H)));
      state.rain.length = want;
      for (let i = 0; i < state.rain.length; i++) {
        const d = state.rain[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y > d.floor) {
          if (Math.random() < 0.3) {
            state.parts.push({ x: d.x, y: d.floor, vx: rand(-30, 30), vy: rand(-70, -30), life: 0.2, max: 0.2, color: 'rgba(191,219,254,0.6)', size: 1.5, floor: d.floor });
          }
          state.rain[i] = drop(rand(BAR - 30, BAR));
        }
      }
    }
    const sky = state.sky;
    sky.flash = Math.max(0, sky.flash - dt * 2.2);
    if (state.phase === 'night' && state.weather === 'storm' && state.mode === 'playing') {
      sky.next -= dt;
      if (sky.next <= 0) {
        sky.next = rand(6, 14);
        sky.flash = 1;
        sky.bolt = makeBolt();
        Sound.thunder(rand(0.15, 1.1));
      }
    }
  }

  function updateEffects(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      if (p.smoke) {
        p.size += dt * 14;
      } else if (p.flame) {
        p.size *= 1 - dt * 1.6;
      } else {
        p.vy += 600 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.casing) p.rot += p.vr * dt;
      if (!p.smoke && !p.flame && p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.5;
        if (p.casing) p.vr *= 0.4;
      }
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    if (state.parts.length > 900) state.parts.splice(0, state.parts.length - 900);
    for (const t of state.tracers) t.life -= dt;
    state.tracers = state.tracers.filter((t) => t.life > 0);
    for (const l of state.lights) l.life -= dt;
    state.lights = state.lights.filter((l) => l.life > 0);
    for (const r of state.rings) {
      r.life -= dt;
      r.r += dt * (r.grow || 260);
    }
    state.rings = state.rings.filter((r) => r.life > 0);
    for (const c of state.corpses) c.t += dt;
    state.corpses = state.corpses.filter((c) => c.t < 8);
    for (const b of state.bodies) b.t += dt;
    // Gore and scorch marks fade away over a minute or so.
    for (const sp of state.splats) sp.t += dt;
    state.splats = state.splats.filter((sp) => sp.t < 70);
    for (const sc of state.scorches) sc.t += dt;
    state.scorches = state.scorches.filter((sc) => sc.t < 90);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 25 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    state.shake = Math.max(0, state.shake - dt * 25);
    for (const s of state.survivors) {
      s.flash -= dt;
      s.hurtT -= dt;
      if (s.bubble) {
        s.bubble.life -= dt;
        if (s.bubble.life <= 0) s.bubble = null;
      }
    }
    state.introT -= dt;
    state.hurtT -= dt;
    if (state.banner) {
      state.banner.life -= dt;
      if (state.banner.life <= 0) state.banner = null;
    }
    updateWeather(dt);
    if (state.heli) {
      const h = state.heli;
      h.t += dt;
      h.x = Math.max(560, W + 160 - h.t * 190);
      h.y = 150 + Math.sin(h.t * 2) * 4 + Math.max(0, 3.2 - h.t) * 6;
    }
  }

  // ---------------------------------------------------------------------------
  // First-play tutorial (remembered once finished or skipped)
  // ---------------------------------------------------------------------------

  const TUTORIAL = [
    { phase: 'night', text: 'Zombies are coming. Click on them to shoot. Headshots do 2.5× damage.', done: () => state.stats.kills >= 2 },
    { phase: 'night', text: 'Press R to reload early. Your pistol never runs out of ammo.', done: () => state.tutFlags.reload, wait: 12 },
    { phase: 'night', text: 'Right-click or press Q to fire a flare: zombies in its light take +25% damage.', done: () => state.tutFlags.flare, wait: 16 },
    { phase: 'night', text: 'Each barricade section has its own health (top left). If one breaks, zombies get through the gap.', wait: 11 },
    { phase: 'day', text: 'Daytime: split 12 hours between repairs, a scavenging run and the search for survivors.' },
    { phase: 'day', text: 'Tabs: give your crew jobs under Crew, spend materials under Build and Armory.' },
    { phase: 'results', text: 'Dusk: spend any leftover materials, then face the night.' },
  ];
  const TUT_ORDER = ['night', 'day', 'results'];

  function currentTip() {
    if (!state || state.tut < 0 || state.mode !== 'playing') return null;
    // Skip tips for a phase that has already passed.
    while (state.tut >= 0 && state.tut < TUTORIAL.length
      && TUT_ORDER.indexOf(TUTORIAL[state.tut].phase) < TUT_ORDER.indexOf(state.phase) && state.phase !== 'night') state.tut++;
    if (state.tut >= TUTORIAL.length) {
      endTutorial();
      return null;
    }
    const tip = TUTORIAL[state.tut];
    return tip.phase === state.phase ? tip : null;
  }

  function tutorialTick(dt) {
    const tip = currentTip();
    if (!tip) return;
    state.tutT += dt;
    if ((tip.done && tip.done()) || (tip.wait && state.tutT > tip.wait)) advanceTutorial();
  }

  function advanceTutorial() {
    state.tut++;
    state.tutT = 0;
    if (state.tut >= TUTORIAL.length) endTutorial();
  }

  function endTutorial() {
    state.tut = -1;
    tutorialDone = true;
    saveJSON('nameless-stand-tutorial', 1);
  }

  // ---------------------------------------------------------------------------
  // Screen layout (all hit-tested in canvas coordinates)
  // ---------------------------------------------------------------------------

  const SYS = { x0: 868, y: 10, size: 36, gap: 6 };
  const PANEL = { x: 40, y: 68, w: 920, h: 418 };
  const LX = PANEL.x + 26;
  const RX = PANEL.x + 470;
  const COL = 424; // column width
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

  const flareButton = () => ({ id: 'flare', x: 10, y: 458, w: 118, h: 34 });

  function tipCard() {
    return state.phase === 'night'
      ? { x: W / 2 - 280, y: 66, w: 560, h: 48 }
      : { x: PANEL.x + 14, y: PANEL.y + PANEL.h - 60, w: 312, h: 54 };
  }

  function tutButtons() {
    if (!currentTip()) return [];
    const c = tipCard();
    return [
      { id: 'tutnext', label: 'Next', x: c.x + c.w - 62, y: c.y + 5, w: 56, h: 19 },
      { id: 'tutskip', label: 'Skip all', x: c.x + c.w - 62, y: c.y + c.h - 24, w: 56, h: 19 },
    ];
  }

  function tabButtons() {
    const left = state.phase === 'day' ? [['plan', 'Plan'], ['crew', `Crew ${state.survivors.length}`]]
      : [['report', 'Report'], ['crew', `Crew ${state.survivors.length}`]];
    const right = [['build', 'Build'], ['armory', 'Armory']];
    return [
      ...left.map(([id, label], k) => ({ id: `tab:left:${id}`, side: 'left', tab: id, label, x: LX + 236 + k * 96, y: PANEL.y + 14, w: 90, h: 28 })),
      ...right.map(([id, label], k) => ({ id: `tab:right:${id}`, side: 'right', tab: id, label, x: RX + 236 + k * 96, y: PANEL.y + 14, w: 90, h: 28 })),
    ];
  }

  const PLAN_ROWS = [
    { key: 'repair', y: PANEL.y + 76 },
    { key: 'scavenge', y: PANEL.y + 130 },
    { key: 'search', y: PANEL.y + 236 },
  ];

  function dayButtons() {
    const btns = [];
    for (const row of PLAN_ROWS) {
      btns.push({ id: `minus:${row.key}`, x: LX + 318, y: row.y, w: 32, h: 32, label: '−' });
      btns.push({ id: `plus:${row.key}`, x: LX + 392, y: row.y, w: 32, h: 32, label: '+' });
    }
    LOCATIONS.forEach((l, k) => {
      btns.push({ id: `loc:${l.id}`, x: LX + k * 86, y: PANEL.y + 174, w: 80, h: 44, loc: l, disabled: l.from && state.night < l.from });
    });
    if (state.lastPlan) btns.push({ id: 'repeat', x: LX + 270, y: PANEL.y + 46, w: 154, h: 22, label: '↻ Same as yesterday' });
    return btns;
  }

  const CREW_ROW = 64;

  function crewButtons() {
    const btns = [];
    state.survivors.forEach((sv, k) => {
      const y = PANEL.y + 72 + k * CREW_ROW;
      ROLES.forEach((r, j) => {
        btns.push({ id: `role:${sv.id}:${r.id}`, sv, role: r, x: LX + 192 + j * 58, y: y + 2, w: 56, h: 24, label: r.label, small: true });
      });
      if (sv.hp < CREW_MAX_HP && state.res.meds > 0) {
        btns.push({ id: `heal:${sv.id}`, x: LX + 128, y: y + 34, w: 58, h: 20, label: '+ Medkit' });
      }
    });
    return btns;
  }

  function buildButtons() {
    return buildRows().map((row, k) => ({
      id: `build:${row.id}`, row,
      x: RX + 300, y: PANEL.y + 76 + k * 40, w: 124, h: 30,
    }));
  }

  function armoryButtons() {
    return armoryRows().map((row, k) => ({
      id: `arm:${row.id}`, row,
      x: RX + 300, y: PANEL.y + 78 + k * 68, w: 124, h: 28,
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
    const tut = tutButtons();
    if (state.phase === 'night') return [...tut, flareButton()];
    if (state.phase !== 'day' && state.phase !== 'results') return [];
    const left = state.tab.left === 'crew' ? crewButtons() : state.phase === 'day' ? dayButtons() : [];
    const right = state.tab.right === 'armory' ? armoryButtons() : buildButtons();
    return [...tut, ...tabButtons(), ...left, ...right, primaryButton()];
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
    if (id === 'mute') { Sound.setMuted(!Sound.muted); return; }
    if (id === 'full') { toggleFullscreen(); return; }
    if (!state || state.mode !== 'playing') return;
    if (id === 'tutnext') { Sound.click(); advanceTutorial(); return; }
    if (id === 'tutskip') { Sound.click(); endTutorial(); return; }
    if (id === 'flare') { fireFlare(input.mx > 300 ? input.mx : 640, 400); return; }
    if (id.startsWith('gun')) { switchGun(Number(id.slice(3))); return; }
    const [op, key, extra] = id.split(':');
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
      const loc = LOCATIONS.find((l) => l.id === key);
      if (loc.from && state.night < loc.from) {
        Sound.deny();
        return;
      }
      state.plan.location = key;
      Sound.click();
    } else if (op === 'tab') {
      state.tab[key] = extra;
      Sound.click();
    } else if (op === 'role') {
      const sv = state.survivors.find((o) => o.id === Number(key));
      if (sv) sv.role = extra;
      Sound.click();
    } else if (op === 'heal') {
      healCrew(Number(key));
    } else if (op === 'build') {
      doBuild(key);
    } else if (op === 'arm') {
      doArmory(`${key}:${extra}`);
    } else if (id === 'repeat') {
      if (repeatPlan()) Sound.click();
      else Sound.deny();
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
  const darkCtx = dark.getContext('2d');
  let glows = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
    // The darkness is all soft gradients, so half resolution (capped) is plenty.
    dark.width = Math.round(clamp(canvas.width / 2, W / 2, 1200));
    dark.height = Math.round(dark.width * (H / W));
    bgKey = ''; // scenery is redrawn at the new size on the next frame
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

  // Additive radial glow.
  function warm(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function render() {
    const s = canvas.width / W;
    const phase = state ? state.phase : 'night';
    const night = phase === 'night';
    const blood = !!(state && state.bloodMoon && night);
    const weather = state && night ? state.weather : 'clear';
    ensureBackground(night, blood, weather, phase === 'ending', s);
    const amp = state && state.shake > 0 && settings.shake ? state.shake : 0;
    const ox = rand(-amp, amp);
    const oy = rand(-amp, amp);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (amp) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.save();
    ctx.drawImage(bg, ox * s, oy * s);
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    glows = [];
    if (state) {
      if (night) drawSkyFx(blood);
      drawWorld(night);
      if (night) {
        if (weather === 'fog') drawFog(0.2);
        drawDarkness(blood);
        if (weather === 'fog') drawFog(0.07);
        drawRain();
        const flash = lightning();
        if (flash > 0) {
          ctx.fillStyle = `rgba(214, 226, 255, ${0.32 * flash})`;
          ctx.fillRect(-20, -20, W + 40, H + 40);
        }
      }
      drawCrewLabels();
      drawFloatingText();
      if (phase === 'ending') drawHeli();
    }
    ctx.restore();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) return;
    drawVignette();
    drawHud();
    if (state.mode === 'playing' || state.mode === 'paused') {
      if (phase === 'day' || phase === 'results') drawDayPanel();
      // Big centred titles would clash with the pause menu.
      else if (state.introT > 0 && state.mode === 'playing') drawIntro();
      if (state.banner && state.mode === 'playing') drawBanner();
      drawTip();
    }
    drawCursor();
  }

  function drawWorld(night) {
    // Ground decals that fade over time.
    for (const sc of state.scorches) {
      const a = clamp(1 - (sc.t - 50) / 40, 0, 1) * 0.75;
      const g = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
      g.addColorStop(0, `rgba(10,8,6,${a})`);
      g.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, sc.r, sc.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sp of state.splats) {
      const a = clamp(1 - (sp.t - 30) / 40, 0, 1);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(${night ? 92 : 110}, 12, 12, ${0.62 * a})`;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.35, sp.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sp.x + sp.r * 0.85, sp.y + 1, sp.r * 0.3, sp.r * 0.12, 0, 0, Math.PI * 2);
      ctx.ellipse(sp.x - sp.r * 0.7, sp.y - 2, sp.r * 0.18, sp.r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSpikes();
    for (const m of state.mines) drawMine(m, night);
    drawWall(night);
    drawWire();
    for (const lad of state.ladders) drawLadder(lad);
    for (const c of state.corpses) drawCorpse(c);
    for (const b of state.bodies) drawBody(b);

    const actors = [
      ...state.zombies.map((z) => ({ y: z.y, draw: () => drawZombie(z, night) })),
      ...state.survivors.filter((sv) => sv.role !== 'rest' || state.phase !== 'night').map((sv) => ({ y: sv.y, draw: () => drawSurvivor(sv) })),
      { y: 452, draw: drawTower },
    ].sort((a, b) => a.y - b.y);
    actors.forEach((a) => a.draw());

    for (const f of state.flareObjs) drawFlare(f);
    for (const a of state.acid) {
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
      glows.push({ x: a.x, y: a.y, r: 12, color: 'rgba(163,230,53,0.5)' });
    }
    for (const r of state.rings) {
      ctx.strokeStyle = `rgba(${r.color || '254, 202, 202'}, ${r.life / r.max})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const t of state.tracers) {
      ctx.strokeStyle = `rgba(${t.color}, ${0.9 * (t.life / t.max)})`;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    for (const p of state.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.smoke || p.flame) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size / 2), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.casing) {
        ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-2.2, -1, 4.4, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-2.2, -1, 4.4, 0.7);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (p.glow && night && p.life > 0.15) glows.push({ x: p.x, y: p.y, r: p.size * 3, color: 'rgba(251,146,60,0.35)' });
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingText() {
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      ctx.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
      outlined(t.text, t.x, t.y, 'bold 13px system-ui, sans-serif', t.color);
    }
    ctx.globalAlpha = 1;
  }

  // A flare: a hot core with a tiny parachute once it starts to fall.
  function drawFlare(f) {
    if (f.phase === 'fall') {
      ctx.strokeStyle = 'rgba(231,229,228,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - 2);
      ctx.lineTo(f.x - 7, f.y - 14);
      ctx.moveTo(f.x, f.y - 2);
      ctx.lineTo(f.x + 7, f.y - 14);
      ctx.stroke();
      ctx.fillStyle = '#e7e5e4';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - 15, 9, 4, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (f.phase === 'rise') {
      ctx.strokeStyle = 'rgba(254,202,202,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - (f.tx - f.sx) * 0.05, f.y + 18);
      ctx.stroke();
    }
    const p = flarePower(f);
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.5 + p, 0, Math.PI * 2);
    ctx.fill();
    glows.push({ x: f.x, y: f.y, r: 26 * p + 8, color: `rgba(255, 140, 140, ${0.9 * p})` });
  }

  // The live parts of the night sky: a breathing blood moon and lightning.
  function drawSkyFx(blood) {
    if (blood) {
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 0.9);
      warm(ctx, 800, 118, 150 + pulse * 20, `rgba(248, 60, 60, ${0.12 + pulse * 0.06})`);
    }
    const b = state.sky.bolt;
    const flash = lightning();
    if (b && flash > 0.05) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, BAR, W, FIELD_TOP - 60 - BAR);
      ctx.clip();
      ctx.lineJoin = 'round';
      for (const [pts, wdt] of [[b.pts, 2.4], [b.branch, 1.2]]) {
        ctx.strokeStyle = `rgba(191, 219, 254, ${0.5 * flash})`;
        ctx.lineWidth = wdt * 4;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${flash})`;
        ctx.lineWidth = wdt;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Night: darken everything except pools of light, then add warm glows.
  function drawDarkness(blood) {
    const dc = darkCtx;
    const ds = dark.width / W;
    dc.setTransform(ds, 0, 0, ds, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, W, H);
    // Muzzle flashes and lightning briefly lift the darkness everywhere.
    const lift = clamp(state.flash * 4, 0, 1) * 0.22 + lightning() * 0.85;
    const base = (state.weather === 'fog' ? 0.7 : 0.66) * (1 - lift);
    dc.fillStyle = blood ? `rgba(40, 2, 10, ${base})` : `rgba(3, 6, 20, ${base})`;
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
    for (const f of state.flareObjs) {
      const p = flarePower(f);
      hole(f.x, f.y, 300 * p, 0.85 * p);
      hole(f.x, 420, 230 * p, 0.75 * p);
    }
    for (const z of state.zombies) if (z.burn > 0) hole(z.x, z.y - 24, 70, 0.6);
    const beam = state.build.light ? beamShape() : null;
    if (beam) {
      const g = dc.createLinearGradient(SEARCHLIGHT.x, SEARCHLIGHT.y, beam.ex, beam.ey);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      dc.fillStyle = g;
      dc.beginPath();
      dc.moveTo(SEARCHLIGHT.x, SEARCHLIGHT.y);
      dc.lineTo(beam.ax, beam.ay);
      dc.lineTo(beam.bx, beam.by);
      dc.closePath();
      dc.fill();
      hole(state.beam.tx, state.beam.ty, 95, 0.9);
    }
    ctx.drawImage(dark, 0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    warm(ctx, LANTERN.x, LANTERN.y, 150, 'rgba(251, 191, 36, 0.22)');
    warm(ctx, STREETLIGHT.x, STREETLIGHT.y + 6, 60 * flicker + 10, `rgba(254, 240, 138, ${0.35 * flicker})`);
    for (const l of state.lights) warm(ctx, l.x, l.y, l.r * 0.35, `rgba(253, 186, 116, ${0.5 * (l.life / l.max)})`);
    for (const f of state.flareObjs) {
      const p = flarePower(f);
      warm(ctx, f.x, f.y, 260 * p, `rgba(248, 113, 113, ${0.2 * p})`);
      warm(ctx, f.x, 420, 200 * p, `rgba(248, 113, 113, ${0.1 * p})`);
    }
    for (const z of state.zombies) {
      if (z.burn > 0) warm(ctx, z.x, z.y - z.lift - 24 * depth(z.y), 46, 'rgba(249, 115, 22, 0.35)');
    }
    if (beam) {
      // A faint visible shaft, stronger in rain and fog.
      const haze = state.weather === 'clear' ? 0.06 : 0.12;
      const g = ctx.createLinearGradient(SEARCHLIGHT.x, SEARCHLIGHT.y, beam.ex, beam.ey);
      g.addColorStop(0, `rgba(254, 249, 195, ${haze * 2})`);
      g.addColorStop(1, `rgba(254, 249, 195, ${haze * 0.5})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(SEARCHLIGHT.x, SEARCHLIGHT.y);
      ctx.lineTo(beam.ax, beam.ay);
      ctx.lineTo(beam.bx, beam.by);
      ctx.closePath();
      ctx.fill();
      warm(ctx, state.beam.tx, state.beam.ty, 80, 'rgba(254, 249, 195, 0.12)');
      warm(ctx, SEARCHLIGHT.x + 4, SEARCHLIGHT.y, 22, 'rgba(255, 255, 240, 0.8)');
    }
    if (blood) {
      const g = ctx.createLinearGradient(0, FIELD_TOP - 120, 0, H);
      g.addColorStop(0, 'rgba(220, 38, 38, 0)');
      g.addColorStop(0.4, 'rgba(220, 38, 38, 0.1)');
      g.addColorStop(1, 'rgba(127, 29, 29, 0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(0, FIELD_TOP - 120, W, H);
    }
    for (const gl of glows) warm(ctx, gl.x, gl.y, gl.r, gl.color);
    ctx.restore();
  }

  // The searchlight cone, ending where it hits the street.
  function beamShape() {
    const b = state.beam;
    const wdt = LIGHTS[state.build.light].width;
    const len = Math.hypot(b.tx - SEARCHLIGHT.x, b.ty - SEARCHLIGHT.y) + 50;
    return {
      ax: SEARCHLIGHT.x + Math.cos(b.ang - wdt) * len, ay: SEARCHLIGHT.y + Math.sin(b.ang - wdt) * len,
      bx: SEARCHLIGHT.x + Math.cos(b.ang + wdt) * len, by: SEARCHLIGHT.y + Math.sin(b.ang + wdt) * len,
      ex: SEARCHLIGHT.x + Math.cos(b.ang) * len, ey: SEARCHLIGHT.y + Math.sin(b.ang) * len,
    };
  }

  // Slow drifting fog banks.
  function drawFog(alpha) {
    for (let i = 0; i < 5; i++) {
      const y = FIELD_TOP - 70 + i * 42;
      const speed = 6 + i * 3;
      for (let k = 0; k < 3; k++) {
        const x = ((state.t * speed + k * 520 + i * 170) % 1560) - 280;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.22);
        warm(ctx, 0, 0, 300, `rgba(${state.bloodMoon ? '190, 120, 130' : '160, 172, 196'}, ${alpha})`);
        ctx.restore();
      }
    }
  }

  function drawRain() {
    if (!state.rain.length) return;
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of state.rain) {
      const k = d.len / Math.hypot(d.vx, d.vy);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * k, d.y - d.vy * k);
    }
    ctx.stroke();
  }

  // Red damage edges when you are hurt or low on health.
  function drawVignette() {
    const low = state.mode === 'playing' && state.phase === 'night' ? clamp((40 - state.hp) / 40, 0, 1) * 0.5 : 0;
    const a = Math.max(low, clamp(state.hurtT, 0, 0.5));
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(127, 29, 29, 0)');
    g.addColorStop(1, `rgba(153, 27, 27, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- Static scenery (drawn once into an offscreen canvas) -------------------

  function ensureBackground(night, blood, weather, ending, s) {
    const key = `${night}|${blood}|${weather}|${ending}|${canvas.width}`;
    if (key === bgKey) return;
    bgKey = key;
    bg.width = canvas.width;
    bg.height = canvas.height;
    const c = bgCtx;
    c.setTransform(s, 0, 0, s, 0, 0);
    const rng = seeded(7);
    const cloudy = weather === 'rain' || weather === 'storm';

    // Sky.
    const sky = c.createLinearGradient(0, 0, 0, FIELD_TOP);
    if (blood) {
      sky.addColorStop(0, '#12020a');
      sky.addColorStop(1, '#5a1018');
    } else if (night && cloudy) {
      sky.addColorStop(0, '#05070d');
      sky.addColorStop(1, '#1a2133');
    } else if (night) {
      sky.addColorStop(0, '#040713');
      sky.addColorStop(1, weather === 'fog' ? '#2a3550' : '#1d2946');
    } else if (ending) {
      sky.addColorStop(0, '#3b3a6b');
      sky.addColorStop(0.55, '#e8875a');
      sky.addColorStop(1, '#fcd9a0');
    } else {
      sky.addColorStop(0, '#7fb6ea');
      sky.addColorStop(0.7, '#cfe3f0');
      sky.addColorStop(1, '#f6ddb0');
    }
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    if (night && !cloudy) {
      for (let k = 0; k < 90; k++) {
        c.fillStyle = `rgba(255,255,255,${rng() * 0.6 + 0.1})`;
        c.fillRect(rng() * W, rng() * (FIELD_TOP - 120), 1.4, 1.4);
      }
    }
    // Moon or sun with a halo (a rising sun at the ending).
    const mx = ending ? 300 : 800;
    const my = ending ? FIELD_TOP - 70 : 118;
    const big = blood ? 1.35 : 1;
    if (!(night && cloudy)) {
      const halo = c.createRadialGradient(mx, my, 10, mx, my, 120 * big);
      halo.addColorStop(0, blood ? 'rgba(248,113,113,0.5)' : night ? 'rgba(226,232,240,0.28)' : 'rgba(255,251,235,0.7)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = halo;
      c.fillRect(mx - 160, my - 160, 320, 320);
      c.fillStyle = blood ? '#f87171' : night ? '#e2e8f0' : ending ? '#fff7d6' : '#fffbeb';
      c.beginPath();
      c.arc(mx, my, (night ? 26 : 34) * big, 0, Math.PI * 2);
      c.fill();
      if (night) {
        c.fillStyle = blood ? 'rgba(80,0,0,0.25)' : 'rgba(0,0,0,0.12)';
        [[-8, -6, 6], [7, 5, 4], [-2, 10, 3]].forEach(([dx, dy, r]) => {
          c.beginPath();
          c.arc(mx + dx * big, my + dy * big, r * big, 0, Math.PI * 2);
          c.fill();
        });
      }
    }
    // Clouds: wisps on clear nights, a heavy deck in rain and storms.
    if (night && cloudy) {
      for (let k = 0; k < 26; k++) {
        c.fillStyle = `rgba(${30 + rng() * 25}, ${36 + rng() * 25}, ${52 + rng() * 25}, ${0.5 + rng() * 0.4})`;
        c.beginPath();
        c.ellipse(rng() * W, BAR + rng() * 120, 90 + rng() * 120, 16 + rng() * 18, 0, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.fillStyle = night ? 'rgba(148,163,184,0.08)' : ending ? 'rgba(255,214,170,0.35)' : 'rgba(255,255,255,0.5)';
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        c.ellipse(rng() * W, 70 + rng() * 110, 80 + rng() * 90, 8 + rng() * 6, 0, 0, Math.PI * 2);
        c.fill();
      }
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
    const far = blood ? '#1f050a' : night ? '#0b1224' : ending ? '#7a5a6e' : '#aab3c4';
    const near = blood ? '#2a070d' : night ? '#10192e' : ending ? '#5a4258' : '#8a93a6';
    layer(far, null, 70, 180, FIELD_TOP - 26, 3);
    layer(near, night ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.25)', 40, 130, FIELD_TOP - 26, 11);
    // Water tower silhouette.
    c.fillStyle = near;
    c.fillRect(470, FIELD_TOP - 200, 44, 30);
    c.fillRect(474, FIELD_TOP - 170, 3, 60);
    c.fillRect(507, FIELD_TOP - 170, 3, 60);
    // Haze where the city meets the street.
    const haze = c.createLinearGradient(0, FIELD_TOP - 80, 0, FIELD_TOP - 20);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(1, blood ? 'rgba(90,16,24,0.5)' : night ? 'rgba(29,41,70,0.6)' : ending ? 'rgba(252,200,150,0.5)' : 'rgba(246,221,176,0.5)');
    c.fillStyle = haze;
    c.fillRect(0, FIELD_TOP - 80, W, 60);

    // Sidewalk, curb and road (wet and darker in the rain).
    const wet = night && cloudy;
    c.fillStyle = night ? '#2b2a2e' : '#b8b2a7';
    c.fillRect(0, FIELD_TOP - 26, W, 14);
    c.fillStyle = night ? '#3a393e' : '#d6d0c4';
    c.fillRect(0, FIELD_TOP - 13, W, 3);
    const road = c.createLinearGradient(0, FIELD_TOP - 10, 0, H);
    road.addColorStop(0, wet ? '#1c1c22' : night ? '#232126' : '#8f8a84');
    road.addColorStop(1, wet ? '#0e0e13' : night ? '#141216' : '#6b6661');
    c.fillStyle = road;
    c.fillRect(0, FIELD_TOP - 10, W, H);
    // Asphalt grit.
    for (let k = 0; k < 1600; k++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      c.fillRect(rng() * W, FIELD_TOP - 10 + rng() * (H - FIELD_TOP + 10), 2, 1);
    }
    // Puddles catch a little light when it rains.
    if (wet) {
      for (let k = 0; k < 9; k++) {
        c.fillStyle = 'rgba(120, 140, 180, 0.12)';
        c.beginPath();
        c.ellipse(300 + rng() * 680, FIELD_TOP + 10 + rng() * 130, 20 + rng() * 40, 3 + rng() * 4, 0, 0, Math.PI * 2);
        c.fill();
      }
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
    [770, 860].forEach((wx) => {
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

  // The barricade is a row of front-facing slabs, drawn far to near so nearer
  // slabs overlap farther ones. Each slab belongs to one of the four sections.
  const SECTION_YS = [];
  for (let y = FIELD_TOP - 8; y <= FIELD_BOT + 12; y += 24) SECTION_YS.push(y);

  const healthColor = (f) => (f > 0.6 ? '#d97706' : f > 0.3 ? '#ea580c' : '#dc2626');

  function drawWall(night) {
    const t = state.build.tier;
    const max = secMax();
    SECTION_YS.forEach((y, si) => {
      // Each slab has its own fixed random pattern, so damage reads consistently.
      const r = seeded(21 + si * 13);
      const sec = state.sections[secOf(y)];
      const frac = sec.hp / max;
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

      if (sec.hp <= 0) {
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
        return;
      }

      ctx.save();
      // A shoved section tips back a little.
      if (sec.push) {
        ctx.translate(cx, y);
        ctx.rotate(-sec.push * 0.004);
        ctx.translate(-cx, -y);
      }
      // Posts.
      for (const px of [x0 + 3 * d, x0 + w - 8 * d]) {
        ctx.beginPath();
        ctx.rect(px, top - 6 * d, 5 * d, h + 6 * d);
        fillOutline('#3f2a14', 1);
      }
      // Boards or sheets, with pieces missing as the section is damaged.
      const rows = 6;
      for (let p = 0; p < rows; p++) {
        const py = top + 4 * d + p * (h - 10 * d) / rows;
        const ph = (h - 10 * d) / rows - 1.5 * d;
        for (let half = 0; half < 2; half++) {
          const keep = r();
          const tilt = (r() - 0.5) * (0.08 + (1 - frac) * 0.25);
          if (keep > frac * 1.15 + 0.05) continue;
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
      // Reinforcement: a bolted metal plate on some slabs.
      const plate = [r(), r(), r(), r()];
      if (t === 1 && plate[0] < 0.7 && plate[1] < frac * 1.2) {
        const pw = w * 0.45;
        const ph = h * 0.35;
        const px = x0 + plate[2] * (w - pw);
        const py = top + h * 0.2 + plate[3] * h * 0.3;
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        fillOutline('#78716c', 1);
        ctx.fillStyle = '#d6d3d1';
        for (const [bx, by] of [[px + 2, py + 2], [px + pw - 4, py + 2], [px + 2, py + ph - 4], [px + pw - 4, py + ph - 4]]) {
          ctx.fillRect(bx, by, 2, 2);
        }
      }
      // Cracks spread across a damaged section.
      const cracks = Math.ceil(clamp(0.8 - frac, 0, 1) * 8);
      ctx.strokeStyle = 'rgba(12,10,9,0.75)';
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 6; k++) {
        let cx2 = x0 + r() * w;
        let cy2 = top + r() * h * 0.7;
        const dir = r() < 0.5 ? -1 : 1;
        if (k >= cracks) continue;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2);
        for (let j = 0; j < 4; j++) {
          cx2 += dir * (1 + r() * 3) * d;
          cy2 += 4 * d;
          ctx.lineTo(cx2 + (j % 2 ? 2 : -2) * d, cy2);
        }
        ctx.stroke();
      }
      // Flash where it was just hit.
      if (sec.hitT > 0) {
        ctx.fillStyle = `rgba(254, 215, 170, ${sec.hitT * 0.9})`;
        ctx.fillRect(x0, top, w, h);
      }
      // Sandbags along the foot of the slab.
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x0 + (k + 0.5) * (w / 3), y - 4 * d, w / 5.2, 5 * d, 0, 0, Math.PI * 2);
        fillOutline(k % 2 ? '#a8946a' : '#9a8660', 1);
      }
      ctx.restore();
    });

    // Per-section health gauges on top of the wall during the night.
    if (!night || state.phase !== 'night') return;
    state.sections.forEach((sec, i) => {
      const f = sec.hp / max;
      if (f > 0.995 && sec.hitT <= 0) return;
      const y = secMidY(i);
      const d = depth(y);
      const x = wallX(y) - 15;
      const top = y - WALL.height * d - 13;
      if (f <= 0) {
        ctx.textAlign = 'center';
        outlined('BREACH', x + 15, top + 6, 'bold 10px system-ui, sans-serif', '#f87171');
        return;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, x - 1, top - 1, 32, 6, 3);
      ctx.fill();
      ctx.fillStyle = healthColor(f);
      roundRect(ctx, x, top, Math.max(3, 30 * f), 4, 2);
      ctx.fill();
    });
  }

  function drawWire() {
    if (!state.build.wire) return;
    for (const y of SECTION_YS) {
      if (state.sections[secOf(y)].hp <= 0) continue;
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
      const x = baseWallX(y) + 56 + r() * 64;
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

  // A siege ladder leaning on the wall (tipping over once shot down).
  function drawLadder(lad) {
    const e = ladderEnds(lad);
    ctx.save();
    if (lad.down) {
      ctx.globalAlpha = clamp(1.2 - lad.fall, 0, 1);
      ctx.translate(e.bx, e.by);
      ctx.rotate(Math.min(1.45, lad.fall * lad.fall * 4));
      ctx.translate(-e.bx, -e.by);
    }
    const d = e.d;
    const rails = [-3.2 * d, 3.2 * d];
    for (const off of rails) limb([[e.bx + off, e.by], [e.tx + off, e.ty]], 2.4 * d, '#8b5a2b');
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.6 * d;
    const n = 7;
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const x = e.bx + (e.tx - e.bx) * u;
      const y = e.by + (e.ty - e.by) * u;
      ctx.beginPath();
      ctx.moveTo(x + rails[0], y);
      ctx.lineTo(x + rails[1], y);
      ctx.stroke();
    }
    ctx.restore();
    if (!lad.down && lad.hp < lad.max) {
      const bx = (e.bx + e.tx) / 2 + 10;
      const by = (e.by + e.ty) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 12, by, 24, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(bx - 12, by, 24 * clamp(lad.hp / lad.max, 0, 1), 3);
    }
  }

  // --- Characters ------------------------------------------------------------------

  function drawZombie(z, night) {
    const t = ZOMBIES[z.type];
    const s = depth(z.y);
    const white = z.flash > 0;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.fillStyle = `rgba(0,0,0,${z.lift ? 0.15 : 0.3})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, t.w * 0.7 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, -z.lift);
    ctx.scale(s, s);
    if (z.type === 'crawler') drawCrawler(z, t, white, night);
    else if (z.type === 'ladder') drawLadderCrew(z, t, white, night);
    else drawHumanoid(z, t, white, night, 0);
    ctx.restore();

    const g = geom(z);
    if (z.burn > 0) drawFlames(g, z);
    if (z.rage > 0) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', g.head.x, g.head.y - g.head.r - 4);
    }
    if (z.hp < z.maxHp) {
      const bw = (z.type === 'boss' ? 70 : 22) * s;
      const y = g.head.y - g.head.r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(z.x - bw / 2, y, bw, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(z.x - bw / 2, y, bw * clamp(z.hp / z.maxHp, 0, 1), 3);
    }
  }

  // Flickering tongues of fire over a burning zombie.
  function drawFlames(g, z) {
    const [x0, y0, x1, y1] = g.body;
    for (let k = 0; k < 3; k++) {
      const fx0 = x0 + ((k + 0.5) / 3) * (x1 - x0);
      const base = y0 + (y1 - y0) * (0.35 + 0.2 * k);
      const hgt = (10 + 6 * Math.sin(state.t * 17 + k * 2 + z.id)) * g.s;
      const grad = ctx.createLinearGradient(fx0, base, fx0, base - hgt);
      grad.addColorStop(0, 'rgba(249,115,22,0.9)');
      grad.addColorStop(1, 'rgba(253,224,71,0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx0 - 4 * g.s, base);
      ctx.quadraticCurveTo(fx0 - 3 * g.s, base - hgt * 0.6, fx0 + Math.sin(state.t * 9 + k) * 2, base - hgt);
      ctx.quadraticCurveTo(fx0 + 3 * g.s, base - hgt * 0.5, fx0 + 4 * g.s, base);
      ctx.fill();
    }
  }

  // Two zombies with a ladder carried over their heads.
  function drawLadderCrew(z, t, white, night) {
    ctx.save();
    ctx.translate(14, 0);
    drawHumanoid({ ...z, walk: z.walk + Math.PI, shirt: z.pants === PANTS[0] ? SHIRTS[2] : SHIRTS[5] }, t, white, night, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(-14, 0);
    drawHumanoid(z, t, white, night, 0);
    ctx.restore();
    const bob = z.moving ? Math.sin(z.walk * 2) * 1.2 : 0;
    for (const y of [-49 + bob, -44 + bob]) limb([[-38, y], [36, y]], 2.4, '#8b5a2b');
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.6;
    for (let x = -32; x <= 32; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, -49 + bob);
      ctx.lineTo(x, -44 + bob);
      ctx.stroke();
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
      if (z.type === 'ladder') limb([[-30, -3], [34, -6]], 2.4, '#8b5a2b');
      ctx.rotate(fall * (Math.PI / 2 - 0.1));
      drawHumanoid(still, t, false, false, fall);
    }
    ctx.restore();
  }

  // A fallen crew member, left where they fell until morning.
  function drawBody(b) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(b.x, b.y);
    ctx.rotate(-(Math.PI / 2 - 0.15) * Math.min(1, b.t / 0.4));
    drawPerson(0, 0, { jacket: b.jacket, pants: b.pants, skin: b.skin, hat: 'none', aim: 0.6, gun: null, flash: 0, recoil: 0 });
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
      // Eye: they glow at night, red under a blood moon.
      const ex = hx - r * 0.5;
      const ey = hy - r * 0.2;
      const blood = state.bloodMoon && night;
      ctx.fillStyle = night ? (blood ? '#fecaca' : '#d9f99d') : '#1c1917';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.1, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
      if (night && !fallen) glows.push({ ...toWorld(ex, ey), r: 5 * k, color: blood ? 'rgba(248,113,113,0.7)' : 'rgba(190,242,100,0.55)' });
    }
    if (z.type === 'riot' && z.helmet > 0) {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 1.5, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      fillOutline(white ? '#fff' : '#1e3a8a');
      ctx.fillStyle = 'rgba(147,197,253,0.55)';
      ctx.fillRect(hx - r - 1.5, hy - 1, r * 0.9, 3);
    }

    // Front arm, reaching for the wall (or holding up a ladder).
    if (z.type === 'ladder') limb([[-1, -16], [-4, -24], [-2, -30]], armW, skin);
    else limb([[-1, -16], [-10, -12 - sway], [-20 - lunge * 7, -15 - sway]], armW, skin);
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
      // Star-shaped muzzle flash with a white-hot core.
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(len, -7);
      ctx.lineTo(len + 8, -3);
      ctx.lineTo(len + 20, -1);
      ctx.lineTo(len + 8, 1);
      ctx.lineTo(len, 7);
      ctx.lineTo(len + 4, 0);
      ctx.fill();
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.arc(len + 3, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      glows.push({ ...toWorld(len + 6, 0), r: 30, color: 'rgba(253, 224, 140, 0.8)' });
    }
  }

  // A person facing right with feet at (x, y), holding a gun aimed at `aim`
  // (or swinging a hammer while repairing).
  function drawPerson(x, y, o) {
    ctx.save();
    ctx.translate(x, y);
    if (o.crouch) ctx.scale(1, 1 - 0.3 * o.crouch);
    const stride = o.walk ? Math.sin(o.walk) * 4 : 0;
    // Legs and boots.
    limb([[0, -22], [-3 - stride * 0.5, -11], [-5 - stride, -1]], 5, shade(o.pants, 0.8));
    limb([[0, -22], [4 + stride * 0.5, -11], [5 + stride, -1]], 5, o.pants);
    for (const fx0 of [-5 - stride, 6 + stride]) {
      ctx.beginPath();
      ctx.roundRect(fx0 - 3, -3, 8, 4, 2);
      fillOutline('#1c1917', 1);
    }
    // Torso and vest.
    ctx.beginPath();
    ctx.roundRect(-7, -41, 14, 21, 4);
    fillOutline(o.hurt ? '#fca5a5' : o.jacket);
    ctx.beginPath();
    ctx.roundRect(-5, -39, 10, 14, 3);
    fillOutline(shade(o.vest || '#3f3f46', 1), 1);
    // Head.
    ctx.beginPath();
    ctx.arc(1, -48, 7, 0, Math.PI * 2);
    fillOutline(o.skin || '#f5d0a9');
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
    } else if (o.hat === 'beanie') {
      ctx.beginPath();
      ctx.arc(1, -50, 7.4, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      fillOutline(shade(o.jacket, 0.6));
    } else if (o.hat === 'band') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(-6, -52, 14, 3);
    } else {
      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.arc(0, -50, 7, Math.PI, Math.PI * 1.9);
      ctx.fill();
    }
    if (o.bandage) {
      ctx.fillStyle = '#f5f5f4';
      ctx.fillRect(-6, -47, 14, 3);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(4, -47, 2, 2);
    }
    // Arms and gun, or a hammer.
    ctx.save();
    if (o.hammer !== undefined) {
      ctx.translate(3, -38);
      ctx.rotate(-0.5 + Math.abs(Math.sin(o.hammer * 7)) * 1.3);
      limb([[-2, 0], [7, 1], [12, 0]], 3.5, o.jacket);
      limb([[12, 0], [12, -12]], 2.2, '#78350f');
      ctx.beginPath();
      ctx.roundRect(8, -16, 9, 5, 1);
      fillOutline('#52525b', 1);
    } else if (o.gun) {
      ctx.translate(3 - o.recoil * 3 * Math.cos(o.aim), -38 - o.recoil * 3 * Math.sin(o.aim));
      ctx.rotate(o.aim);
      limb([[-2, 0], [6, 3], [10, 1]], 3.5, shade(o.jacket, 0.8));
      drawGun(o.gun, o.flash);
      limb([[0, -1], [10, 2], [17, 0]], 3.5, o.jacket);
    } else {
      ctx.translate(3, -38);
      limb([[-2, 0], [2, 10], [4, 18]], 3.5, o.jacket);
    }
    ctx.restore();
    ctx.restore();
  }

  function drawTower() {
    const top = PLAYER.y;
    const ground = 452;
    const x0 = PLAYER.x - 30;
    const x1 = PLAYER.x + 30;
    // Searchlight on its own post behind the platform.
    if (state.build.light) {
      ctx.beginPath();
      ctx.rect(SEARCHLIGHT.x - 2, SEARCHLIGHT.y + 6, 4, ground - SEARCHLIGHT.y - 6);
      fillOutline('#3f3f46', 1);
      const ang = state.phase === 'night' ? state.beam.ang : 0.35;
      ctx.save();
      ctx.translate(SEARCHLIGHT.x, SEARCHLIGHT.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.roundRect(-9, -6, 16, 12, 3);
      fillOutline(state.build.light > 1 ? '#475569' : '#52525b', 1);
      ctx.beginPath();
      ctx.ellipse(7, 0, 2.5, 6.5, 0, 0, Math.PI * 2);
      fillOutline(state.phase === 'night' ? '#fefce8' : '#d4d4d8', 1);
      ctx.restore();
    }
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
      aim: state.phase === 'night' ? aimAngle() : 0.1, gun: w.kind, flash: state.flash, recoil: state.recoil,
      hurt: state.hurtT > 0.3, bandage: state.hp < 40,
    });
    // Sandbag parapet in front of the player's legs.
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(PLAYER.x + 14 + (k % 2) * 6, top - 4 - k * 7, 13, 5, 0, 0, Math.PI * 2);
      fillOutline(k % 2 ? '#a8946a' : '#9a8660', 1);
    }
  }

  function drawSurvivor(sv) {
    const night = state.phase === 'night';
    const repairing = night && sv.role === 'repair' && !sv.walking && sv.x > 190;
    drawPerson(sv.x, sv.y, {
      jacket: sv.jacket, pants: sv.pants, vest: '#44403c', hat: sv.hat, skin: sv.skin,
      aim: night ? sv.aim || 0 : 0.15, gun: TRAITS[sv.trait].gun, flash: sv.flash, recoil: sv.recoil * 0.5,
      hammer: repairing ? sv.work : undefined, walk: sv.walking ? state.t * 10 : 0,
      crouch: sv.hide > 0 ? 1 : 0, bandage: sv.hp < 50, hurt: sv.hurtT > 0,
    });
  }

  // Names, health and speech bubbles for the crew, drawn above the darkness.
  function drawCrewLabels() {
    const night = state.phase === 'night';
    for (const sv of state.survivors) {
      if (night && sv.role === 'rest') continue;
      const hover = Math.hypot(input.mx - sv.x, input.my - (sv.y - 28)) < 22 && input.over;
      if ((night && state.introT > 0) || hover || (night && sv.hp < CREW_MAX_HP)) {
        const f = clamp(sv.hp / CREW_MAX_HP, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sv.x - 13, sv.y + 4, 26, 4);
        ctx.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#f87171';
        ctx.fillRect(sv.x - 12, sv.y + 5, 24 * f, 2);
      }
      if ((night && state.introT > 0) || hover) {
        ctx.textAlign = 'center';
        outlined(`${sv.name} · ${TRAITS[sv.trait].label}`, sv.x, sv.y + 18, 'bold 9px system-ui, sans-serif', TRAITS[sv.trait].color);
      }
      if (!sv.bubble) continue;
      const b = sv.bubble;
      ctx.globalAlpha = clamp(b.life / 0.3, 0, 1) * clamp((b.max - b.life) / 0.15, 0, 1);
      ctx.font = 'bold 10px system-ui, sans-serif';
      const name = `${sv.name}: `;
      const nw = ctx.measureText(name).width;
      const tw = ctx.measureText(b.text).width;
      const bw = nw + tw + 12;
      const bx = clamp(sv.x - 10, 4, W - bw - 4);
      const by = sv.y - 84;
      ctx.fillStyle = 'rgba(255, 251, 235, 0.94)';
      roundRect(ctx, bx, by, bw, 17, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sv.x - 2, by + 16);
      ctx.lineTo(sv.x + 4, by + 16);
      ctx.lineTo(sv.x + 2, by + 23);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = shade(TRAITS[sv.trait].color, 0.45);
      ctx.fillText(name, bx + 6, by + 12);
      ctx.fillStyle = '#1c1917';
      ctx.fillText(b.text, bx + 6 + nw, by + 12);
      ctx.globalAlpha = 1;
    }
  }

  // The rescue helicopter at the end.
  function drawHeli() {
    const h = state.heli;
    if (!h) return;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(Math.max(0, 3 - h.t) * -0.04);
    // Rope ladder once it is hovering.
    if (h.x <= 561) {
      const len = Math.min(1, (h.t - 3.4) / 1.5) * 150;
      if (len > 0) {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.5;
        for (const dx of [-4, 4]) {
          ctx.beginPath();
          ctx.moveTo(dx, 22);
          ctx.lineTo(dx + Math.sin(h.t * 2) * 3, 22 + len);
          ctx.stroke();
        }
      }
    }
    limb([[18, -2], [84, -8]], 7, '#3f4a2c');
    ctx.beginPath();
    ctx.ellipse(84, -14, 4, 10, 0.2, 0, Math.PI * 2);
    fillOutline('#3f4a2c');
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2);
    fillOutline('#4d5a2a');
    ctx.beginPath();
    ctx.ellipse(-16, -3, 14, 10, 0, Math.PI * 1.05, Math.PI * 1.95);
    fillOutline('#bae6fd', 1);
    limb([[-22, 24], [24, 24]], 2.5, '#27272a');
    limb([[-12, 16], [-14, 24]], 2, '#27272a');
    limb([[12, 16], [14, 24]], 2, '#27272a');
    ctx.fillStyle = 'rgba(30, 30, 30, 0.45)';
    const blade = 60 + Math.sin(h.t * 60) * 6;
    ctx.fillRect(-blade, -24, blade * 2, 2.5);
    ctx.fillRect(-2, -26, 4, 8);
    ctx.restore();
  }

  // --- HUD ------------------------------------------------------------------------

  const WEATHER_LABEL = { clear: '', rain: 'Rain', fog: 'Fog', storm: 'Storm' };

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
    const night = state.phase === 'night';
    const label = night ? `Night ${state.night}` : state.phase === 'ending' ? 'Dawn' : `Day ${state.night}`;
    ctx.fillText(label, 14, 25);
    const labelW = ctx.measureText(label).width;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`of ${NIGHTS}`, 20 + labelW, 25);
    ctx.fillStyle = '#d6d3d1';
    if (night) {
      const left = state.spawns.length + state.zombies.length;
      const tag = [state.bloodMoon ? 'Blood moon' : '', WEATHER_LABEL[state.weather]].filter(Boolean).join(' · ');
      ctx.fillStyle = state.bloodMoon ? '#fca5a5' : '#d6d3d1';
      ctx.fillText(`${left} left${tag ? ` · ${tag}` : ''}`, 14, 44);
    } else {
      ctx.fillText(`${state.stats.kills} kills so far`, 14, 44);
    }

    wallBar(150, 12, 150);
    bar(150, 34, 150, 'You', state.hp, PLAYER_MAX, state.hp < 35 ? '#ef4444' : '#22c55e');
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
      const low = gun.owned && gun.reserve !== Infinity && gun.mag + gun.reserve <= w.mag;
      ctx.fillStyle = low ? '#ef4444' : active ? '#44403c' : '#d6d3d1';
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

    if (night && (state.mode === 'playing' || state.mode === 'paused')) drawFlareButton(hover);
  }

  // The barricade bar is split into its four sections, far lane on the left.
  function wallBar(x, y, w) {
    const gap = 3;
    const sw = (w - gap * (SECTIONS - 1)) / SECTIONS;
    const max = secMax();
    state.sections.forEach((sec, i) => {
      const sx = x + i * (sw + gap);
      const f = clamp(sec.hp / max, 0, 1);
      ctx.fillStyle = f <= 0 ? 'rgba(127,29,29,0.75)' : 'rgba(255,255,255,0.15)';
      roundRect(ctx, sx, y, sw, 14, 4);
      ctx.fill();
      if (f > 0) {
        ctx.fillStyle = sec.hitT > 0 ? '#fed7aa' : healthColor(f);
        roundRect(ctx, sx, y, Math.max(6, sw * f), 14, 4);
        ctx.fill();
      }
    });
    ctx.fillStyle = '#fff';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const broken = state.sections.filter((s) => s.hp <= 0).length;
    outlined(broken ? `${broken} breached!` : `Barricade ${state.barricade}/${tier().max}`, x + w / 2, y + 11, '600 10px system-ui, sans-serif', '#fff');
  }

  function bar(x, y, w, label, v, max, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, x, y, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(14, w * clamp(v / max, 0, 1)), 14, 7);
    ctx.fill();
    ctx.textAlign = 'center';
    outlined(`${label} ${Math.ceil(v)}/${max}`, x + w / 2, y + 11, '600 10px system-ui, sans-serif', '#fff');
  }

  function drawFlareButton(hover) {
    const b = flareButton();
    const hot = hover && hover.id === 'flare';
    const has = state.flares > 0;
    ctx.globalAlpha = has ? 1 : 0.45;
    ctx.fillStyle = hot && has ? 'rgba(248,113,113,0.5)' : 'rgba(20,16,14,0.7)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248,113,113,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Little flare cartridges, one per flare left.
    for (let k = 0; k < Math.min(state.flares, 6); k++) {
      ctx.fillStyle = '#ef4444';
      roundRect(ctx, b.x + 8 + k * 7, b.y + 9, 5, 16, 2);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(b.x + 8 + k * 7, b.y + 9, 5, 3);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(has ? 'Flare' : 'No flares', b.x + b.w - 8, b.y + 16);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#d6d3d1';
    ctx.fillText('Q / right-click', b.x + b.w - 8, b.y + 28);
    ctx.globalAlpha = 1;
  }

  const SPECIAL = {
    horde: ['HORDE NIGHT', '#fdba74'],
    siege: ['SIEGE', '#fdba74'],
    boss: ['BOSS NIGHT', '#fca5a5'],
    last: ['THE LAST STAND', '#f87171'],
  };

  function drawIntro() {
    ctx.globalAlpha = clamp(state.introT, 0, 1);
    ctx.textAlign = 'center';
    const sp = SPECIAL[state.special];
    if (sp) outlined(sp[0], W / 2, 128, 'bold 16px system-ui, sans-serif', sp[1]);
    outlined(`Night ${state.night}`, W / 2, 170, 'bold 44px system-ui, sans-serif', state.bloodMoon ? '#fca5a5' : '#fef3c7');
    let sub = `${state.nightTotal} zombies are coming`;
    if (state.night === 1) sub = 'Aim with the mouse, click to shoot, R to reload';
    else if (state.special === 'last') sub = 'Hold until dawn. Rescue is coming.';
    else if (state.special === 'boss') sub = 'Something huge is coming tonight';
    else if (state.special === 'horde') sub = `${state.nightTotal} zombies in three surges`;
    else if (state.special === 'siege') sub = 'They are bringing ladders. Shoot them down.';
    else if (state.bloodMoon) sub = `Blood moon: ${state.nightTotal} restless zombies`;
    outlined(sub, W / 2, 200, '600 15px system-ui, sans-serif', '#e7e5e4');
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    const b = state.banner;
    const a = clamp(b.life / 0.5, 0, 1) * clamp((b.max - b.life) / 0.25, 0, 1);
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, 140, 0, 220);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 140, W, 80);
    ctx.textAlign = 'center';
    outlined(b.text, W / 2, 186, 'bold 34px system-ui, sans-serif', b.color);
    if (b.sub) outlined(b.sub, W / 2, 208, '600 13px system-ui, sans-serif', '#e7e5e4');
    ctx.globalAlpha = 1;
  }

  function drawTip() {
    const tip = currentTip();
    if (!tip) return;
    const c = tipCard();
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(28, 25, 23, 0.94)';
    roundRect(ctx, c.x, c.y, c.w, c.h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`TIP ${state.tut + 1}/${TUTORIAL.length}`, c.x + 12, c.y + 15);
    ctx.fillStyle = '#fafaf9';
    const day = state.phase !== 'night';
    ctx.font = `${day ? 11 : 12}px system-ui, sans-serif`;
    wrapText(tip.text, c.x + 12, c.y + (day ? 28 : 30), c.w - 84, day ? 12.5 : 14);
    for (const b of tutButtons()) drawButton(b, hover, 'plain', b.label);
  }

  function drawButton(b, hover, style, label) {
    const hot = hover && hover.id === b.id;
    ctx.globalAlpha = b.disabled ? 0.4 : 1;
    if (style === 'primary') ctx.fillStyle = hot ? '#f59e0b' : '#d97706';
    else if (style === 'selected') ctx.fillStyle = '#fef3c7';
    else ctx.fillStyle = hot && !b.disabled ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.16)';
    roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(8, b.h / 2));
    ctx.fill();
    if (label !== undefined) {
      ctx.fillStyle = style === 'selected' ? '#1c1917' : '#fff';
      ctx.font = `bold ${style === 'primary' ? 15 : b.h > 34 ? 18 : b.h < 24 || b.small ? 10.5 : 12}px system-ui, sans-serif`;
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

  // --- Day screen ---------------------------------------------------------------------

  function drawDayPanel() {
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(12,10,9,0.9)';
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(RX - 22, PANEL.y + 20, 1, PANEL.h - 90);

    for (const b of tabButtons()) drawButton(b, hover, state.tab[b.side] === b.tab ? 'selected' : 'plain', b.label);

    // Left column: the plan, what happened, or the crew.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(state.phase === 'day' ? `Day ${state.night}` : 'Dusk', LX, PANEL.y + 36);
    if (state.tab.left === 'crew') drawCrewTab(hover);
    else if (state.phase === 'day') drawPlanTab(hover);
    else drawReportTab();

    // Right column: building and supplies, or the armory.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(state.tab.right === 'armory' ? 'Armory' : 'Build & supplies', RX, PANEL.y + 34);
    ctx.fillStyle = '#fde68a';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${state.res.materials} materials · ${plural(state.res.meds, 'medkit')} · Health ${Math.ceil(state.hp)}`, RX, PANEL.y + 58);
    if (state.tab.right === 'armory') drawArmoryTab(hover);
    else drawBuildTab(hover);

    const pb = primaryButton();
    drawButton(pb, hover, 'primary', pb.label);
    ctx.fillStyle = '#78716c';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Enter', pb.x + pb.w + 30, pb.y + 25);
  }

  function drawPlanTab(hover) {
    const left = DAY_HOURS - planUsed();
    ctx.fillStyle = left ? '#fde68a' : '#a8a29e';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${DAY_HOURS}h until dark · ${left ? `${left} unassigned` : 'all assigned'}`, LX, PANEL.y + 61);
    const p = state.plan;
    const loc = LOCATIONS.find((l) => l.id === p.location);
    const scavs = state.survivors.filter((sv) => sv.role === 'scavenge').map((sv) => sv.name);
    const notes = {
      repair: ['Repair the barricade', `+${p.repair * repairPerHour()} (${repairPerHour()} per hour, more with repairers)`],
      scavenge: ['Scavenging run', `${loc.name}: ${loc.desc} ${loc.riskLabel}.${scavs.length ? ` With ${scavs.join(', ')}.` : ''}`],
      search: ['Search for survivors',
        state.survivors.length >= MAX_SURVIVORS ? 'Your crew is full' : 'Survivors fight at night and help by day'],
    };
    for (const row of PLAN_ROWS) {
      const [name, note] = notes[row.key];
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(name, LX, row.y + 13);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(note, LX, row.y + 30, 312);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p[row.key]}h`, LX + 371, row.y + 22);
    }
    for (const b of dayButtons()) {
      if (b.loc) {
        const sel = p.location === b.loc.id;
        drawButton(b, hover, sel ? 'selected' : 'plain');
        ctx.globalAlpha = b.disabled ? 0.45 : 1;
        ctx.textAlign = 'center';
        ctx.fillStyle = sel ? '#1c1917' : '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(b.loc.short, b.x + b.w / 2, b.y + 19);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = sel ? '#78716c' : b.loc.risk > 0.1 ? '#fca5a5' : '#a8a29e';
        ctx.fillText(b.disabled ? `Night ${b.loc.from}+` : b.loc.riskLabel, b.x + b.w / 2, b.y + 34);
        ctx.globalAlpha = 1;
      } else {
        drawButton(b, hover, 'plain', b.label);
      }
    }
    // What is known about tonight.
    const n = state.night;
    const sp = SPECIAL[nightKind(n)];
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = sp ? sp[1] : '#a8a29e';
    const guards = state.survivors.filter((sv) => sv.role === 'guard' || sv.role === 'scavenge').length;
    ctx.fillText(`Tonight: ${sp ? sp[0].toLowerCase() : 'night ' + n}${guards ? ` · ${plural(guards, 'gun')} on the wall` : ''} · ${plural(FLARES_BASE + FLARE_KIT[state.build.flareKit].extra + state.bonusFlares, 'flare')}`, LX, PANEL.y + 296);
  }

  function drawReportTab() {
    ctx.fillStyle = '#a8a29e';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('How the day went. Spend materials before dark.', LX, PANEL.y + 61);
    let y = PANEL.y + 88;
    for (const line of state.results) {
      if (y > PANEL.y + 340) break;
      ctx.font = line.big ? 'bold 14px system-ui, sans-serif' : line.tone === 'quote' ? 'italic 13px system-ui, sans-serif' : '13px system-ui, sans-serif';
      ctx.fillStyle = line.tone === 'good' ? '#fde047' : line.tone === 'bad' ? '#fca5a5' : line.tone === 'warn' ? '#f87171'
        : line.tone === 'quote' ? '#bfdbfe' : '#e7e5e4';
      y += wrapText(line.text, LX, y, RX - LX - 40, 17) * 17 + 5;
    }
  }

  function drawCrewTab(hover) {
    ctx.fillStyle = '#a8a29e';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Give each survivor a job for today and tonight.', LX, PANEL.y + 61);
    if (!state.survivors.length) {
      ctx.fillStyle = '#d6d3d1';
      ctx.font = '14px system-ui, sans-serif';
      wrapText('Nobody else yet. Spend some hours searching for survivors: they shoot at night, help with repairs and scavenge.',
        LX, PANEL.y + 100, COL - 10, 19);
    }
    const btns = crewButtons();
    state.survivors.forEach((sv, k) => {
      const y = PANEL.y + 72 + k * CREW_ROW;
      const tr = TRAITS[sv.trait];
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, LX - 8, y - 4, COL + 12, CREW_ROW - 6, 8);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(sv.name, LX, y + 13);
      const nw = ctx.measureText(sv.name).width;
      ctx.fillStyle = tr.color;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(tr.label, LX + nw + 8, y + 13);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`${tr.desc} · ${sv.kills} kills`, LX, y + 27, 190);
      // Health.
      const f = clamp(sv.hp / CREW_MAX_HP, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, LX, y + 37, 120, 12, 6);
      ctx.fill();
      ctx.fillStyle = f > 0.5 ? '#22c55e' : f > 0.25 ? '#eab308' : '#ef4444';
      roundRect(ctx, LX, y + 37, Math.max(12, 120 * f), 12, 6);
      ctx.fill();
      ctx.textAlign = 'center';
      outlined(`${Math.ceil(sv.hp)}/${CREW_MAX_HP}${sv.hp < 50 ? ' · hurt' : ''}`, LX + 60, y + 47, '600 9px system-ui, sans-serif', '#fff');
      const role = ROLES.find((r) => r.id === sv.role);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d6d3d1';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(role.tonight, LX + 198, y + 44);
      for (const b of btns) {
        if (b.sv === sv) drawButton(b, hover, b.role.id === sv.role ? 'selected' : 'plain', b.label);
        else if (b.id === `heal:${sv.id}`) drawButton(b, hover, 'plain', b.label);
      }
    });
    if (state.fallen.length) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#a8a29e';
      ctx.font = 'italic 11px system-ui, sans-serif';
      const names = state.fallen.map((f) => `${f.name} (${TRAITS[f.trait].label}, ${f.where})`).join(' · ');
      wrapText(`In memory: ${names}`, LX, PANEL.y + 342, COL, 13);
    }
  }

  function drawBuildTab(hover) {
    for (const b of buildButtons()) {
      const row = b.row;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(row.name, RX, b.y + 12);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(row.desc, RX, b.y + 27, 292);
      const label = row.cost === null ? 'Maxed' : row.cost === 'use' ? 'Use' : `Build · ${row.cost}`;
      drawButton({ ...b, disabled: !row.ok }, hover, 'plain', label);
    }
    // A small picture of the wall: each section's health.
    const y = PANEL.y + 352;
    ctx.fillStyle = '#a8a29e';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Sections', RX, y + 10);
    const max = secMax();
    state.sections.forEach((sec, i) => {
      const f = clamp(sec.hp / max, 0, 1);
      const x = RX + 58 + i * 92;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, x, y, 86, 12, 5);
      ctx.fill();
      if (f > 0) {
        ctx.fillStyle = healthColor(f);
        roundRect(ctx, x, y, Math.max(8, 86 * f), 12, 5);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      outlined(f > 0 ? `${Math.round(sec.hp)}` : 'Broken', x + 43, y + 10, '600 9px system-ui, sans-serif', '#fff');
    });
  }

  // Weapon comparison: each bar is the gun on offer, the white tick is your best gun.
  function drawArmoryTab(hover) {
    const best = bestOwnedGun();
    const bs = gunStats(best);
    const scales = { dps: 360, power: 180, mag: 100, reload: 4 };
    for (const b of armoryButtons()) {
      const row = b.row;
      const w = row.w;
      const st = gunStats(w);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(w.name, RX, b.y + 12);
      ctx.fillStyle = row.owned ? '#86efac' : '#a8a29e';
      ctx.font = '11px system-ui, sans-serif';
      const g = state.guns[row.i];
      ctx.fillText(row.owned ? `Owned · ${g.mag + g.reserve} rounds` : row.locked ? 'Traders bring it later' : 'Trade materials for it', RX, b.y + 26);
      drawButton({ ...b, disabled: !row.ok }, hover, 'plain', row.label);
      const bars = [
        ['Dmg/s', st.dps / scales.dps, bs.dps / scales.dps, true],
        ['Shot', st.power / scales.power, bs.power / scales.power, true],
        ['Mag', Math.sqrt(st.mag / scales.mag), Math.sqrt(bs.mag / scales.mag), true],
        ['Reload', 1 - st.reload / scales.reload, 1 - bs.reload / scales.reload, true],
      ];
      bars.forEach(([label, v, ref], k) => {
        const x = RX + k * 106;
        const y = b.y + 36;
        ctx.fillStyle = '#a8a29e';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, x, y + 7);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 36, y, 62, 8);
        const better = v > ref + 0.01;
        const worse = v < ref - 0.01;
        ctx.fillStyle = w === best ? '#fef3c7' : better ? '#4ade80' : worse ? '#f87171' : '#e7e5e4';
        ctx.fillRect(x + 36, y, 62 * clamp(v, 0.03, 1), 8);
        if (w !== best) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 36 + 62 * clamp(ref, 0, 1) - 1, y - 2, 2, 12);
        }
      });
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#78716c';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`Bars compare with your best gun (${best.short}, white tick). Green is better.`, RX, PANEL.y + 360);
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
    // Reload progress as a ring around the crosshair.
    if (state.reloadT > 0) {
      const p = 1 - state.reloadT / w.reload;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(input.mx, input.my, r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(input.mx, input.my, r + 9, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    const low = g.mag > 0 && g.mag <= Math.ceil(w.mag * 0.25);
    const txt = state.reloadT > 0 ? 'Reloading' : g.mag === 0 ? (g.reserve > 0 ? 'Reload (R)' : 'Empty') : `${g.mag}`;
    outlined(txt, input.mx + r + 14, input.my + r + 14, '600 11px system-ui, sans-serif', g.mag === 0 || low ? '#fca5a5' : '#fef3c7');
  }

  // ---------------------------------------------------------------------------
  // Overlays (menu, pause, game over, ending) and input
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');
  let overlayKind = null;

  function settingsRow() {
    return `
      <div class="row settings">
        <button type="button" class="small" data-act="shake" aria-pressed="${settings.shake}">Screen shake: ${settings.shake ? 'On' : 'Off'}</button>
        <button type="button" class="small" data-act="fx" aria-pressed="${!reduced()}">Effects: ${reduced() ? 'Reduced' : 'Full'}</button>
        ${tutorialDone ? '<button type="button" class="small" data-act="tutorial">Replay tutorial</button>' : ''}
      </div>`;
  }

  function statsGrid() {
    const s = state.stats;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const cells = [
      [s.kills, 'kills'], [s.headshots, 'headshots'], [`${acc}%`, 'accuracy'], [s.bestNight, 'best night'],
      [s.bosses, 'giants felled'], [s.ladders, 'ladders downed'], [s.flares, 'flares fired'], [state.recruited, 'recruits'],
    ];
    return `<div class="stats">${cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
  }

  function memorial() {
    if (!state.fallen.length) return '';
    const names = state.fallen.map((f) => `${f.name} <span>(${TRAITS[f.trait].label}, ${f.where}, ${plural(f.kills, 'kill')})</span>`);
    return `<p class="memorial">In memory of ${names.join(' · ')}</p>`;
  }

  function showOverlay(kind) {
    overlayKind = kind;
    overlay.classList.toggle('ending', kind === 'ending');
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    const best = loadBest();
    const bestLine = best
      ? `<p class="help">Best run: ${best.won ? `survived all ${best.of || 15} nights` : `reached night ${best.night}`}, ${best.kills} kills.</p>`
      : '';
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2>Nameless Stand</h2>
          <p>Hold the barricade through the night. Scavenge, build and lead your crew by day. Survive ${NIGHTS} nights until rescue.</p>
          <div class="row"><button type="button" class="primary" data-act="start">${tutorialDone ? 'Start' : 'Start (with tutorial)'}</button></div>
          <p class="help">Mouse to aim and shoot · R reload · Q or right-click: flare · 1–5 or scroll: switch guns · P pause · M mute · F fullscreen</p>
          ${settingsRow()}
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
          ${settingsRow()}
        </div>`;
    } else if (kind === 'over' || kind === 'ending') {
      const s = state.stats;
      const prev = state.prevBest;
      const reached = state.won ? NIGHTS : state.night;
      const record = !prev || reached > prev.night || (reached === prev.night && s.kills > prev.kills);
      const alive = state.survivors.map((sv) => sv.name);
      const crewLine = alive.length > 1 ? `${alive.slice(0, -1).join(', ')} and ${alive[alive.length - 1]}` : alive[0];
      const story = state.won
        ? `The helicopter lifts off at dawn with you${alive.length ? ` and ${crewLine}` : ', alone'} on board.${state.fallen.length ? ' Not everyone made it.' : ' Nobody left behind.'}`
        : `You fell on night ${state.night}${state.special === 'boss' ? ', crushed by a giant' : ''}.`;
      overlay.innerHTML = `
        <div>
          <h2>${state.won ? 'Rescue at Dawn' : 'Overrun'}</h2>
          <p>${story}</p>
          ${statsGrid()}
          ${memorial()}
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
    const act = b.dataset.act;
    if (act === 'start') start();
    else if (act === 'resume') togglePause();
    else if (act === 'menu') showMenu();
    else if (act === 'shake' || act === 'fx' || act === 'tutorial') {
      if (act === 'shake') settings.shake = !settings.shake;
      else if (act === 'fx') settings.fx = reduced() ? 'full' : 'reduced';
      else {
        tutorialDone = false;
        saveJSON('nameless-stand-tutorial', 0);
      }
      saveSettings();
      showOverlay(overlayKind);
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
    input.over = true;
  });
  canvas.addEventListener('pointerleave', () => {
    input.over = false;
    input.down = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
    if (e.button === 2) {
      if (state && state.mode === 'playing' && state.phase === 'night') fireFlare(p.x, p.y);
      return;
    }
    if (e.button !== 0) return;
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
    if (k === 'm') { Sound.setMuted(!Sound.muted); return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (!state || state.mode !== 'playing') return;
    if (k === 'r') startReload();
    else if (k === 'q' && state.phase === 'night') fireFlare(input.mx, input.my);
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
    let fxDt = real;
    if (state && state.mode === 'playing') {
      if (state.hitStop > 0) {
        // Hit-stop: the world freezes for a beat on big hits.
        state.hitStop -= real;
        fxDt = 0;
      } else {
        // The last zombie of the night goes down in slow motion.
        let scale = SPEED;
        if (state.slowmo > 0) {
          state.slowmo -= real;
          scale *= 0.3;
          fxDt = real * 0.4;
        }
        let left = real * scale;
        while (left > 0 && state.mode === 'playing') {
          const dt = Math.min(1 / 60, left);
          step(dt);
          left -= dt;
        }
      }
    }
    if (state && state.mode !== 'paused') updateEffects(fxDt);
    Sound.ambient(state && state.mode === 'playing' && state.phase === 'night' ? state.weather : null);
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing (?autoplay plays with an aim bot).
  window.__ns = {
    get state() { return state; },
    input,
    settings,
    start,
    spawn: spawnZombie,
    build: doBuild,
    armory: doArmory,
    flare: fireFlare,
    recruit: addSurvivor,
    activate,
    hitTest,
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
