import { TAU, clamp, rand, randInt, dist, dist2, pick, fmtTime } from './core/utils.js';
import { Sound } from './core/audio.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import {
  WORLD_W,
  WORLD_H,
  RESOURCE_TYPES,
  WEAPONS,
  UPGRADES,
  MISSIONS,
  DEVICES,
  BIOMES,
} from './config/data.js';
import { Hazard } from './world/hazard.js';
import { Boss } from './entities/boss.js';
import { WEAPON_CHOICES, DEVICE_CHOICES, cycleChoice } from './config/loadouts.js';
import { burst, Particle } from './entities/particles.js';
import { Pool } from './systems/pool.js';
import * as Profiles from './systems/profiles.js';
import { drawClone } from './entities/clone.js';
import {
  BODY_COLORS,
  VISOR_COLORS,
  ACCENT_COLORS,
  SHAPES,
  defaultAppearance,
} from './config/appearance.js';
import { applyStatus } from './systems/status.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Hive } from './entities/hive.js';
import { ResourceNode } from './world/resource.js';
import { Mule } from './world/mule.js';
import { Outpost } from './world/outpost.js';
import { Mission } from './systems/mission.js';
import { SpatialGrid } from './systems/spatialGrid.js';
import { Music } from './systems/music.js';
import { AudioEngine } from './systems/audioEngine.js';
import { tickCombo } from './systems/combo.js';
import * as Overdrive from './systems/overdrive.js';
import { makeRng, randIn, randIntIn, pickIn } from './systems/rng.js';
import { CLASSES, CLASS_KEYS } from './config/classes.js';
import { MODIFIERS, MODIFIER_KEYS, aggregate } from './config/modifiers.js';

/* ================================ GAME ================================== */
const SAVE_KEY = 'exoswarm_salvage_save_v1';

function defaultMeta() {
  return {
    credits: 0,
    resources: { bioResin: 0, sporeFiber: 0, salvageChips: 0, softQuartz: 0, hiveEnzymes: 0 },
    upgrades: {
      cloneHealth: 0,
      rifleDamage: 0,
      cargoHarness: 0,
      muleArmor: 0,
      deviceCooling: 0,
      marketContacts: 0,
      signalArray: 0,
      hydroponicsTray: 0,
    },
    unlockedWeapons: ['pulse', 'shotgun', 'arc'],
    loadout: {
      weapons: ['pulse', 'shotgun', 'arc'],
      devices: ['turret', 'shield', 'scanner', 'mine'],
    },
    runCount: 0,
    bestScore: 0,
    totalKills: 0,
    totalHives: 0,
    bestCombo: 0,
    bossKills: 0,
    appearance: defaultAppearance(),
    class: 'vanguard',
    settings: { master: 0.8, music: 0.6, sfx: 0.9, fxScale: 1 },
    priceMods: { bioResin: 1, sporeFiber: 1, salvageChips: 1, softQuartz: 1, hiveEnzymes: 1 },
  };
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera();
    // login | station | playing | paused | death | victory | customize
    this.state = 'login';
    this.activeProfile = null;
    this.meta = defaultMeta();
    this.loginMode = 'select'; // 'select' | 'create' | 'password'
    this.loginTarget = null; // profile awaiting password
    Profiles.migrateLegacy(); // fold any legacy single save into a Default profile
    this.toasts = [];
    this.uiButtons = [];
    this.uiBlocksFire = false;
    this.showMinimap = true;
    this.showStats = false;
    this.lastTime = performance.now();
    this.hitstopT = 0;
    this.deco = [];
    this.endSummary = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(canvas);
    requestAnimationFrame((t) => this.loop(t));
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  /* ------------------------------ SAVE / LOAD --------------------------- */
  saveKey() {
    return this.activeProfile ? Profiles.saveKeyFor(this.activeProfile.id) : SAVE_KEY;
  }
  save() {
    if (!this.activeProfile) return; // nothing to persist until a profile is active
    try {
      localStorage.setItem(this.saveKey(), JSON.stringify(this.meta));
    } catch (e) {}
  }
  load() {
    this.meta = defaultMeta(); // start clean so profiles never bleed into each other
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (raw) {
        const data = JSON.parse(raw);
        const def = defaultMeta();
        this.meta = Object.assign(def, data);
        this.meta.resources = Object.assign(def.resources, data.resources || {});
        this.meta.upgrades = Object.assign(def.upgrades, data.upgrades || {});
        this.meta.priceMods = Object.assign(def.priceMods, data.priceMods || {});
        // migrate pre-loadout saves; sanitize entries against current config
        this.meta.loadout = Object.assign(def.loadout, data.loadout || {});
        const lw = this.meta.loadout.weapons.filter((k) => WEAPONS[k]).slice(0, 3);
        for (const k of ['pulse', 'shotgun', 'arc'])
          if (lw.length < 3 && !lw.includes(k)) lw.push(k);
        const ld = this.meta.loadout.devices.filter((k) => DEVICES[k]).slice(0, 4);
        for (const k of ['turret', 'shield', 'scanner', 'mine'])
          if (ld.length < 4 && !ld.includes(k)) ld.push(k);
        this.meta.loadout = { weapons: lw, devices: ld };
      }
    } catch (e) {
      this.meta = defaultMeta();
    }
  }
  /* ------------------------------ ECONOMY ------------------------------- */
  sellPrice(type) {
    const base = RESOURCE_TYPES[type].price * this.meta.priceMods[type];
    const valueMult = this.run && this.run.mods ? this.run.mods.valueMult : 1;
    const mult = (1 + 0.1 * this.meta.upgrades.marketContacts) * valueMult;
    return Math.round(base * mult);
  }
  rerollPrices() {
    for (const k in this.meta.priceMods) {
      let m = this.meta.priceMods[k] + rand(-0.12, 0.12);
      this.meta.priceMods[k] = clamp(m, 0.8, 1.25);
    }
  }
  upgradeCost(key) {
    const def = UPGRADES[key];
    const lvl = this.meta.upgrades[key];
    const scale = Math.pow(1.5, lvl);
    const cost = { credits: Math.round(def.credits * scale), res: {} };
    for (const r in def.res) cost.res[r] = Math.ceil(def.res[r] * scale);
    return cost;
  }
  canBuy(key) {
    const def = UPGRADES[key];
    if (this.meta.upgrades[key] >= def.max) return false;
    const c = this.upgradeCost(key);
    if (this.meta.credits < c.credits) return false;
    for (const r in c.res) if (this.meta.resources[r] < c.res[r]) return false;
    return true;
  }
  buyUpgrade(key) {
    if (!this.canBuy(key)) {
      Sound.hurt();
      return;
    }
    const c = this.upgradeCost(key);
    this.meta.credits -= c.credits;
    for (const r in c.res) this.meta.resources[r] -= c.res[r];
    this.meta.upgrades[key]++;
    this.save();
    Sound.deliver();
  }
  /* ------------------------------ RUN SETUP ----------------------------- */
  startRun(opts = {}) {
    this.state = 'playing';
    this.particles = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.hives = [];
    this.resources = [];
    this.turrets = [];
    this.mines = [];
    this.enemyGrid = new SpatialGrid(128);
    this.particlePool = new Pool(
      () => new Particle(0, 0, 0, 0, 0, 1, '#fff'),
      (p, x, y, vx, vy, life, size, color) => p.reset(x, y, vx, vy, life, size, color)
    );
    if (this.fxScale == null) this.fxScale = 1;
    this.damageNumbers = [];
    this.drones = [];
    this.decoys = [];
    this.empPulse = null;
    this.hitstopT = 0;
    this.scanPulse = null;
    this.scanRevealT = 0;
    this.arcBeam = null;
    this.toasts = [];
    this.evacT = 0;
    this.evacuating = false;

    this.run = {
      time: 0,
      kills: 0,
      score: 0,
      deliveredValue: 0,
      delivered: {},
      hivesDestroyed: 0,
      maxHiveLevelKilled: 0,
      reactorActivated: false,
      reactorTimer: 0,
      muleLost: false,
      threat: 0,
      threatT: 90,
      spawnT: 5,
      combo: 0,
      comboT: 0,
      comboMult: 1,
      event: null,
      eventT: rand(40, 70),
      bossSpawned: false,
      bossSlain: false,
      bossT: 0,
      bossKillT: 0,
      odCharge: 0,
      odActive: 0,
      seed: opts.seed != null ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0,
      modifiers: opts.modifiers || [],
      mods: aggregate(opts.modifiers || []),
    };
    this.run.threat = this.run.mods.startThreatAdd; // some modifiers start hotter
    this.fxScale = (this.meta.settings && this.meta.settings.fxScale) || 1;
    // Seeded world-gen: same seed → identical layout (daily / reproducible runs).
    // Only gen/draws use worldRng; per-frame cosmetic randomness stays on Math.random.
    this.worldRng = makeRng(this.run.seed);
    const R = (a, b) => randIn(this.worldRng, a, b);
    const RI = (a, b) => randIntIn(this.worldRng, a, b);
    const P = (arr) => pickIn(this.worldRng, arr);
    this.biome = P(BIOMES);
    this.boss = null;

    // outpost near center, offset
    const ox = WORLD_W / 2 + R(-250, 250);
    const oy = WORLD_H / 2 + R(-250, 250);
    this.outpost = new Outpost(this, ox, oy);
    this.player = new Player(this, ox + 140, oy + 140);
    this.mule = new Mule(this, ox + 200, oy + 200);
    this.camera.x = this.player.x - this.canvas.width / 2;
    this.camera.y = this.player.y - this.canvas.height / 2;

    // decorations
    this.deco = [];
    for (let i = 0; i < 90; i++) {
      this.deco.push({
        x: R(0, WORLD_W),
        y: R(0, WORLD_H),
        r: R(8, 45),
        t: RI(0, 2),
        ph: R(0, TAU),
      });
    }
    // hives
    const nHives = RI(3, 5);
    for (let i = 0; i < nHives; i++) {
      let hx,
        hy,
        ok = false,
        tries = 0;
      while (!ok && tries++ < 80) {
        hx = R(250, WORLD_W - 250);
        hy = R(250, WORLD_H - 250);
        ok = dist(hx, hy, ox, oy) > 650;
        for (const h of this.hives) if (dist(hx, hy, h.x, h.y) < 550) ok = false;
      }
      this.hives.push(new Hive(this, hx, hy));
    }
    // resources
    const types = [
      'bioResin',
      'bioResin',
      'bioResin',
      'salvageChips',
      'salvageChips',
      'sporeFiber',
      'sporeFiber',
      'softQuartz',
    ];
    const nRes = RI(35, 50);
    for (let i = 0; i < nRes; i++) {
      let rx,
        ry,
        ok = false,
        tries = 0;
      while (!ok && tries++ < 60) {
        rx = R(120, WORLD_W - 120);
        ry = R(120, WORLD_H - 120);
        ok = dist(rx, ry, ox, oy) > 180;
      }
      this.resources.push(new ResourceNode(this, rx, ry, P(types)));
    }
    // environmental hazards, weighted by the biome's bias
    this.hazards = [];
    const hpool = [];
    for (const hk in this.biome.hazardBias) {
      const n = Math.round(this.biome.hazardBias[hk] * 2);
      for (let i = 0; i < n; i++) hpool.push(hk);
    }
    const nHaz = RI(5, 8);
    for (let i = 0; i < nHaz; i++) {
      let hx2,
        hy2,
        ok2 = false,
        tries2 = 0;
      while (!ok2 && tries2++ < 50) {
        hx2 = R(150, WORLD_W - 150);
        hy2 = R(150, WORLD_H - 150);
        ok2 = dist(hx2, hy2, ox, oy) > 350;
      }
      this.hazards.push(new Hazard(this, P(hpool), hx2, hy2));
    }
    // starting enemies near hives
    for (const h of this.hives) {
      const n = RI(2, 4);
      for (let i = 0; i < n; i++) {
        const a = R(0, TAU),
          d = R(60, 160);
        this.enemies.push(
          new Enemy(this, 'skitterling', h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, 1)
        );
      }
    }
    // mission
    this.mission = new Mission(this, P(Object.keys(MISSIONS)));
    this.toast('Mission: ' + this.mission.def.name + ' — ' + this.mission.def.brief);
    Sound.evac();
  }
  /* ------------------------------ THREAT -------------------------------- */
  threatLevel() {
    return Math.min(5, Math.floor(this.run ? this.run.threat : 0));
  }
  addThreat(v) {
    if (!this.run) return;
    const before = this.threatLevel();
    this.run.threat = clamp(this.run.threat + v, 0, 5);
    if (this.threatLevel() > before) {
      this.toast('THREAT ESCALATED: level ' + this.threatLevel());
      Sound.alarm();
    }
  }
  /* ------------------------------ END RUN -------------------------------- */
  finishRun(died) {
    const r = this.run,
      m = this.meta;
    const credits = Math.round(r.deliveredValue * (r.mods ? r.mods.payoutMult : 1));
    m.credits += credits;
    for (const k in r.delivered) m.resources[k] += r.delivered[k];
    // hydroponics
    const hydro = m.upgrades.hydroponicsTray * 3;
    if (hydro > 0) m.resources.bioResin += hydro;
    let bonusCr = 0;
    if (!died && this.mission.complete) {
      bonusCr = 80;
      if (this.mission.bonus) bonusCr += 60;
      m.credits += bonusCr;
    }
    m.runCount++;
    m.totalKills += r.kills;
    m.totalHives += r.hivesDestroyed;
    m.bestCombo = Math.max(m.bestCombo || 0, r.maxCombo || 0);
    if (r.bossSlain) m.bossKills = (m.bossKills || 0) + 1;
    const score = r.score + r.deliveredValue + (this.mission.complete ? 100 : 0);
    m.bestScore = Math.max(m.bestScore, score);
    this.rerollPrices();
    this.save();
    this.endSummary = {
      died,
      credits,
      bonusCr,
      hydro,
      missionComplete: this.mission.complete,
      missionBonus: this.mission.bonus,
      missionName: this.mission.def.name,
      kills: r.kills,
      hives: r.hivesDestroyed,
      delivered: Object.assign({}, r.delivered),
      deliveredValue: r.deliveredValue,
      time: r.time,
      score,
    };
  }
  onPlayerDeath() {
    this.finishRun(true);
    this.state = 'death';
  }
  evacuate() {
    Sound.evac();
    this.finishRun(false);
    this.state = 'victory';
  }
  toast(msg) {
    this.toasts.push({ msg, t: 4 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  /* ------------------------------ MAIN LOOP ------------------------------ */
  // True if a world point is within (padded) view — used to cull offscreen draws.
  inView(x, y, pad = 0) {
    const sx = this.camera.wx(x),
      sy = this.camera.wy(y);
    return (
      sx >= -pad && sy >= -pad && sx <= this.canvas.width + pad && sy <= this.canvas.height + pad
    );
  }
  loop(t) {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    // Error boundary: a stray throw must never kill the rAF chain (which would
    // freeze input permanently). Surface it once via a toast and keep running.
    this._errToastT = Math.max(0, (this._errToastT || 0) - dt);
    try {
      this.update(dt);
      this.draw();
    } catch (e) {
      if (this._errToastT <= 0) {
        this.toast('⚠ Recovered from an error');
        this._errToastT = 3;
      }
    } finally {
      Input.endFrame();
      requestAnimationFrame((tt) => this.loop(tt));
    }
  }
  update(dt) {
    this.uiBlocksFire = this.state !== 'playing';
    Music.sync(this); // adaptive soundtrack follows game state + threat
    this.applySettings(); // cheap; takes effect once the audio engine is ready
    for (const ts of this.toasts) ts.t -= dt;
    this.toasts = this.toasts.filter((ts) => ts.t > 0);

    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'paused':
        if (Input.wasPressed('Escape')) {
          // Esc backs out of the settings sub-view first, then resumes
          if (this.pauseView === 'settings') this.pauseView = 'menu';
          else this.state = 'playing';
        }
        break;
      case 'station':
      case 'death':
      case 'victory':
        break;
    }
  }
  explodeAoe(pr) {
    pr.aoeDone = true;
    const R = pr.aoe;
    Sound.explosion();
    this.camera.addShake(4);
    burst(this, pr.x, pr.y, '#ffb04d', 18, 200, 4, 0.6);
    burst(this, pr.x, pr.y, '#ff7a3d', 10, 130, 3, 0.5);
    this.enemyGrid.queryCircle(pr.x, pr.y, R + 30, (e) => {
      if (e.dead) return false;
      const d = dist(pr.x, pr.y, e.x, e.y);
      if (d < R + e.radius) {
        e.takeDamage(pr.damage * (1 - (d / (R + e.radius)) * 0.5), pr.x, pr.y);
        if (pr.status && !e.dead) applyStatus(e, pr.status);
      }
      return false;
    });
    for (const h of this.hives) {
      if (!h.destroyed && dist(pr.x, pr.y, h.x, h.y) < R + h.radius)
        h.takeDamage(pr.damage, pr.x, pr.y);
    }
    if (
      this.boss &&
      !this.boss.dead &&
      dist(pr.x, pr.y, this.boss.x, this.boss.y) < R + this.boss.radius
    )
      this.boss.takeDamage(pr.damage, pr.x, pr.y);
  }
  hitstop(d) {
    // brief global slow-mo on big hits; capped so mass kills never stall
    this.hitstopT = Math.min(0.06, this.hitstopT + d);
  }
  updatePlaying(rdt) {
    // decay hitstop with REAL dt (a scaled decay would freeze itself)
    const dt = this.hitstopT > 0 ? rdt * 0.15 : rdt;
    this.hitstopT = Math.max(0, this.hitstopT - rdt);
    tickCombo(this.run, rdt); // combo decays in real time, even during hitstop
    Overdrive.tickOverdrive(this.run, rdt);
    const r = this.run,
      p = this.player;
    r.maxCombo = Math.max(r.maxCombo || 0, r.combo || 0);
    r.time += dt;

    if (Input.wasPressed('Escape')) {
      this.pauseView = 'menu';
      this.state = 'paused';
      return;
    }
    // Overdrive ultimate (Space) — full meter unleashes a fire-rate/damage surge
    if (Input.wasPressed(' ') && Overdrive.activate(r)) {
      this.toast('OVERDRIVE!');
      Sound.alarm();
      this.camera.addShake(5);
    }
    if (Input.wasPressed('m')) this.showMinimap = !this.showMinimap;
    if (Input.wasPressed('Tab')) this.showStats = !this.showStats;

    // evac
    const nearOutpost = dist(p.x, p.y, this.outpost.x, this.outpost.y) < 220;
    if (Input.wasPressed('v')) {
      if (nearOutpost && !this.evacuating) {
        this.evacuating = true;
        this.evacT = p.signal < 10 ? 8 : 4;
        this.toast('Evacuation started — do not leave the outpost!');
        Sound.evac();
      } else if (!nearOutpost) {
        this.toast('Evacuation is only possible near the outpost');
      }
    }
    if (this.evacuating) {
      if (!nearOutpost) {
        this.evacuating = false;
        this.toast('Evacuation aborted');
      } else {
        this.evacT -= dt;
        if (this.evacT <= 0) {
          this.evacuate();
          return;
        }
      }
    }

    // threat over time
    r.threatT -= dt;
    if (r.threatT <= 0) {
      r.threatT = 90;
      this.addThreat(1);
    }
    // weather events at elevated threat
    if (!r.event) {
      r.eventT -= dt;
      if (r.eventT <= 0 && this.threatLevel() >= 3) {
        r.event = { type: 'sporeStorm', t: 18, max: 18 };
        this.toast('SPORE STORM — toxic clouds closing in!');
        Sound.alarm();
        for (let i = 0; i < 4; i++) {
          const a = rand(0, TAU),
            d = rand(250, 500);
          this.hazards.push(
            new Hazard(
              this,
              'sporeCloud',
              clamp(p.x + Math.cos(a) * d, 100, WORLD_W - 100),
              clamp(p.y + Math.sin(a) * d, 100, WORLD_H - 100),
              18
            )
          );
        }
      }
    } else {
      r.event.t -= dt;
      if (r.event.t <= 0) {
        r.event = null;
        r.eventT = rand(40, 70);
        this.toast('The storm has passed');
      }
    }
    // carrying rare resources raises threat slowly
    let rare = 0;
    for (const k of p.carry) if (k === 'hiveEnzymes' || k === 'softQuartz') rare++;
    if (rare > 0) r.threat = clamp(r.threat + rare * 0.004 * dt * 10, 0, 5);
    // lingering near hives raises threat
    for (const h of this.hives) {
      if (!h.destroyed && dist(p.x, p.y, h.x, h.y) < h.influence) {
        r.threat = clamp(r.threat + 0.01 * dt, 0, 5);
      }
    }

    // signal stability (Signal Array: each level slows decay)
    const sigDrop = Math.max(0.35, 1 - 0.2 * this.meta.upgrades.signalArray);
    let drop = 0;
    for (const h of this.hives) {
      if (!h.destroyed && dist(p.x, p.y, h.x, h.y) < h.influence) drop += 4;
    }
    if (this.threatLevel() >= 5) drop += 0.8;
    else if (this.threatLevel() >= 4) drop += 0.3;
    p.signal = clamp(p.signal - drop * sigDrop * r.mods.signalDrainMult * dt, 0, 100);
    if (this.outpost.active && nearOutpost) p.signal = clamp(p.signal + 6 * dt, 0, 100);
    else if (dist(p.x, p.y, this.outpost.x, this.outpost.y) < 350)
      p.signal = clamp(p.signal + 2 * dt, 0, 100);

    // ambient spawn pressure
    r.spawnT -= dt;
    const minutes = r.time / 60;
    const interval =
      Math.max(1.6, 9 - this.threatLevel() * 0.9 - minutes * 0.3) / r.mods.spawnRateMult;
    if (r.spawnT <= 0 && r.time > 30 && this.enemies.length < 70) {
      r.spawnT = interval;
      const tl = this.threatLevel();
      const pool = ['skitterling'];
      if (tl >= 1) pool.push('skitterling');
      if (tl >= 2) pool.push('sporeMantis');
      if (tl >= 3) pool.push('sporeMantis', 'carapaceBull');
      if (tl >= 4) pool.push('carapaceBull');
      if (tl >= 5) pool.push('carapaceBull', 'broodWarden');
      const n = 1 + Math.floor(tl / 2);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const d = rand(620, 900);
        const sx = clamp(p.x + Math.cos(a) * d, 30, WORLD_W - 30);
        const sy = clamp(p.y + Math.sin(a) * d, 30, WORLD_H - 30);
        const e = new Enemy(
          this,
          pick(pool),
          sx,
          sy,
          1 + Math.floor(tl / 2),
          Math.random() < 0.04 + tl * 0.04 ? pick(['splitter', 'armored', 'frenzied']) : null
        );
        e.aggro = true;
        this.enemies.push(e);
      }
    }

    // reset warden shields then update enemies
    for (const e of this.enemies) e.shielded = false;
    p.update(dt);
    if (this.mule) this.mule.update(dt);
    this.outpost.update(dt);
    for (const h of this.hives) h.update(dt);
    // apex warden: spawns once at full threat or when every hive is down
    if (!r.bossSpawned) {
      const allHivesDead = this.hives.length > 0 && this.hives.every((h) => h.destroyed);
      if (this.threatLevel() >= 5 || allHivesDead) {
        r.bossSpawned = true;
        r.bossT = r.time;
        const ba = rand(0, TAU);
        this.boss = new Boss(
          this,
          clamp(p.x + Math.cos(ba) * 700, 100, WORLD_W - 100),
          clamp(p.y + Math.sin(ba) * 700, 100, WORLD_H - 100)
        );
        this.toast('WARNING: Apex Warden inbound!');
        Sound.bossRoar();
        this.camera.addShake(8);
      }
    }
    if (this.boss && !this.boss.dead) this.boss.update(dt);
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    // rebuild spatial grid (used by projectiles, turrets, mines, AOE queries)
    this.enemyGrid.clear();
    for (const e of this.enemies) if (!e.dead) this.enemyGrid.insert(e);
    for (const t of this.turrets) if (!t.dead) t.update(dt);
    for (const m of this.mines) if (!m.dead) m.update(dt);
    for (const d of this.drones) if (!d.dead) d.update(dt);
    for (const dc of this.decoys) if (!dc.dead) dc.update(dt);
    for (const hz of this.hazards) if (!hz.dead) hz.update(dt);
    for (const rs of this.resources) rs.update(dt);

    // projectiles
    for (const pr of this.projectiles) {
      pr.update(dt, this);
      if (!pr.dead) {
        // vs enemies (spatial grid; pad by max enemy radius)
        this.enemyGrid.queryCircle(pr.x, pr.y, pr.radius + 30, (e) => {
          if (e.dead) return false;
          if (pr.hitSet && pr.hitSet.has(e)) return false;
          if (dist2(pr.x, pr.y, e.x, e.y) < (e.radius + pr.radius) * (e.radius + pr.radius)) {
            e.takeDamage(pr.damage, pr.prevX, pr.prevY);
            if (pr.status) applyStatus(e, pr.status);
            if (pr.pierce) {
              pr.hitSet.add(e);
              return false; // railgun: keep flying through
            }
            pr.dead = true;
            return true;
          }
          return false;
        });
      }
      if (!pr.dead) {
        // vs hives
        for (const h of this.hives) {
          if (h.destroyed) continue;
          if (dist2(pr.x, pr.y, h.x, h.y) < (h.radius + pr.radius) * (h.radius + pr.radius)) {
            h.takeDamage(pr.damage, pr.prevX, pr.prevY);
            pr.dead = true;
            break;
          }
        }
      }
      if (!pr.dead && this.boss && !this.boss.dead) {
        // vs boss
        const b = this.boss;
        if (dist2(pr.x, pr.y, b.x, b.y) < (b.radius + pr.radius) * (b.radius + pr.radius)) {
          b.takeDamage(pr.damage, pr.prevX, pr.prevY);
          if (pr.status) applyStatus(b, pr.status);
          if (!pr.pierce) pr.dead = true;
        }
      }
      // flak: detonate on impact or at end of range
      if (pr.dead && pr.aoe && !pr.aoeDone) this.explodeAoe(pr);
    }
    for (const pr of this.enemyProjectiles) {
      pr.update(dt, this);
      if (pr.dead) continue;
      if (dist2(pr.x, pr.y, p.x, p.y) < (p.radius + pr.radius + (p.shield ? 16 : 0)) ** 2) {
        p.takeDamage(pr.damage, pr.x, pr.y);
        pr.dead = true;
        continue;
      }
      if (
        this.mule &&
        !this.mule.dead &&
        dist2(pr.x, pr.y, this.mule.x, this.mule.y) < (this.mule.radius + pr.radius) ** 2
      ) {
        this.mule.takeDamage(pr.damage * 0.7);
        pr.dead = true;
      }
    }

    // scanner pulse
    if (this.scanPulse) {
      this.scanPulse.r += 700 * dt;
      if (this.scanPulse.r > this.scanPulse.max) this.scanPulse = null;
    }
    // EMP shockwave ring
    if (this.empPulse) {
      this.empPulse.r += 900 * dt;
      if (this.empPulse.r > this.empPulse.max) this.empPulse = null;
    }
    this.scanRevealT = Math.max(0, this.scanRevealT - dt);
    if (this.arcBeam) {
      this.arcBeam.t -= dt;
      if (this.arcBeam.t <= 0) this.arcBeam = null;
    }

    // particles
    this.particles = this.particles.filter((pt) => {
      if (pt.update(dt)) return true;
      this.particlePool.release(pt); // recycle dead particles
      return false;
    });
    this.damageNumbers = this.damageNumbers.filter((dn) => dn.update(rdt));
    // cleanup
    this.projectiles = this.projectiles.filter((x) => !x.dead);
    this.enemyProjectiles = this.enemyProjectiles.filter((x) => !x.dead);
    this.enemies = this.enemies.filter((x) => !x.dead);
    this.turrets = this.turrets.filter((x) => !x.dead);
    this.mines = this.mines.filter((x) => !x.dead);
    this.drones = this.drones.filter((x) => !x.dead);
    this.decoys = this.decoys.filter((x) => !x.dead);
    this.hazards = this.hazards.filter((x) => !x.dead);
    this.resources = this.resources.filter((x) => !x.dead);

    // mission
    this.mission.update(dt);

    // camera
    this.camera.follow(p.x, p.y, dt, this.canvas.width, this.canvas.height);
  }
  /* ------------------------------ DRAW ----------------------------------- */
  draw() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this.syncLoginOverlay();
    if (this.state === 'login') {
      this.drawLogin();
      return;
    }
    if (this.state === 'customize') {
      this.drawCustomize();
      return;
    }
    if (this.state === 'settings') {
      this.drawSettings();
      return;
    }
    if (this.state === 'classsel') {
      this.drawClassSelect();
      return;
    }
    if (this.state === 'contract') {
      this.drawContract();
      return;
    }
    if (this.state === 'station') {
      this.drawStation();
      return;
    }
    if (!this.run) {
      this.drawStation();
      return;
    }
    this.drawWorld();
    this.drawHUD();
    if (this.state === 'paused') this.drawPause();
    if (this.state === 'death') this.drawEnd(true);
    if (this.state === 'victory') this.drawEnd(false);
  }
  /* ------------------------------ LOGIN ---------------------------------- */
  // Show/position the HTML <input> overlay only during create/password entry,
  // and hide it otherwise so it never steals keyboard focus during play.
  syncLoginOverlay() {
    const ov = typeof document !== 'undefined' && document.getElementById('loginOverlay');
    if (!ov) return;
    const show =
      this.state === 'login' && (this.loginMode === 'create' || this.loginMode === 'password');
    ov.style.display = show ? 'flex' : 'none';
    const nameEl = document.getElementById('loginName');
    if (nameEl) nameEl.style.display = this.loginMode === 'create' ? 'block' : 'none';
  }
  selectProfile(profile) {
    if (profile.hash) {
      this.loginMode = 'password';
      this.loginTarget = profile;
      const pass = document.getElementById('loginPass');
      if (pass) {
        pass.value = '';
        pass.focus();
      }
    } else {
      this.enterProfile(profile);
    }
  }
  enterProfile(profile) {
    this.activeProfile = profile;
    this.load();
    this.loginMode = 'select';
    this.loginTarget = null;
    this.state = 'station';
    Sound.deliver();
  }
  async confirmPassword() {
    const pass = document.getElementById('loginPass');
    const ok = await Profiles.verify(this.loginTarget, pass ? pass.value : '');
    if (ok) this.enterProfile(this.loginTarget);
    else this.toast('Wrong password');
  }
  async createNewProfile() {
    const nameEl = document.getElementById('loginName');
    const passEl = document.getElementById('loginPass');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      this.toast('Enter a profile name');
      return;
    }
    if (!Profiles.cryptoAvailable() && passEl && passEl.value) {
      this.toast('Password unavailable in this context');
    }
    const profile = await Profiles.createProfile(name, passEl ? passEl.value : '');
    if (nameEl) nameEl.value = '';
    if (passEl) passEl.value = '';
    this.enterProfile(profile);
  }
  drawLogin() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a1418');
    bg.addColorStop(1, '#05080a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXOSWARM SALVAGE', W / 2, 90);
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '13px monospace';
    ctx.fillText('Select a clone profile', W / 2, 118);
    ctx.textAlign = 'left';

    if (this.loginMode === 'password' && this.loginTarget) {
      ctx.fillStyle = '#dff6ff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Password for "' + this.loginTarget.name + '"', W / 2, H / 2 - 70);
      ctx.textAlign = 'left';
      this.button(
        W / 2 - 130,
        H / 2 + 10,
        125,
        40,
        'ENTER',
        () => this.confirmPassword(),
        true,
        '#2ee6a8'
      );
      this.button(W / 2 + 5, H / 2 + 10, 125, 40, 'CANCEL', () => {
        this.loginMode = 'select';
        this.loginTarget = null;
      });
      return;
    }
    if (this.loginMode === 'create') {
      ctx.fillStyle = '#dff6ff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('New profile — name + optional password', W / 2, H / 2 - 80);
      ctx.textAlign = 'left';
      this.button(
        W / 2 - 130,
        H / 2 + 30,
        125,
        40,
        'CREATE',
        () => this.createNewProfile(),
        true,
        '#2ee6a8'
      );
      this.button(W / 2 + 5, H / 2 + 30, 125, 40, 'CANCEL', () => (this.loginMode = 'select'));
      return;
    }

    // profile cards
    const profiles = Profiles.listProfiles();
    const cardW = 280,
      cardH = 70,
      gap = 14;
    let y = 160;
    for (const p of profiles) {
      const x = W / 2 - cardW / 2;
      this.button(x, y, cardW - 44, cardH, '', () => this.selectProfile(p), true);
      const save = this.readProfileMeta(p.id);
      // avatar — the profile's actual clone, drawn procedurally
      drawClone(ctx, x + 28, y + cardH / 2, save.appearance || defaultAppearance(), 1.1, 0, 0, 0);
      ctx.fillStyle = '#dff6ff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(p.name + (p.hash ? '  🔒' : ''), x + 56, y + 28);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '11px monospace';
      ctx.fillText(
        'Best ' + (save.bestScore || 0) + ' • Runs ' + (save.runCount || 0),
        x + 56,
        y + 48
      );
      this.button(
        x + cardW - 40,
        y,
        40,
        cardH,
        '✕',
        () => this.deleteProfileConfirmed(p),
        true,
        '#ff8d8d'
      );
      y += cardH + gap;
    }
    this.button(
      W / 2 - cardW / 2,
      y + 4,
      cardW,
      44,
      '+ NEW PROFILE',
      () => {
        this.loginMode = 'create';
        const nameEl = document.getElementById('loginName');
        if (nameEl) {
          nameEl.value = '';
          nameEl.focus();
        }
      },
      true,
      '#7af5ff'
    );
  }
  readProfileMeta(id) {
    try {
      const raw = localStorage.getItem(Profiles.saveKeyFor(id));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }
  deleteProfileConfirmed(p) {
    Profiles.deleteProfile(p.id);
    if (this.activeProfile && this.activeProfile.id === p.id) this.activeProfile = null;
    Sound.hurt();
  }
  /* ---------------------------- CUSTOMIZE -------------------------------- */
  swatchRow(label, y, colors, current, set) {
    const ctx = this.ctx;
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText(label, 60, y - 8);
    let x = 60;
    for (const c of colors) {
      const sel = c === current;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 34, 26);
      ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeRect(x, y, 34, 26);
      const hit =
        Input.mouseX >= x && Input.mouseX <= x + 34 && Input.mouseY >= y && Input.mouseY <= y + 26;
      if (hit && Input.mouseClicked) {
        set(c);
        this.save();
        Sound.device();
      }
      x += 42;
    }
  }
  drawCustomize() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.fillStyle = '#070d10';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('CUSTOMIZE CLONE', 60, 56);
    const ap = this.meta.appearance || (this.meta.appearance = defaultAppearance());
    // live preview (large)
    ctx.save();
    drawClone(
      ctx,
      W - 220,
      220,
      ap,
      5,
      -Math.PI / 2 + Math.sin(performance.now() / 600) * 0.3,
      0,
      0
    );
    ctx.restore();
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('preview', W - 220, 320);
    ctx.textAlign = 'left';

    this.swatchRow('BODY', 120, BODY_COLORS, ap.body, (c) => (ap.body = c));
    this.swatchRow('VISOR', 190, VISOR_COLORS, ap.visor, (c) => (ap.visor = c));
    this.swatchRow('ACCENT', 260, ACCENT_COLORS, ap.accent, (c) => (ap.accent = c));
    // shape toggles
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText('SHAPE', 60, 322);
    let sx = 60;
    for (const s of SHAPES) {
      this.button(
        sx,
        330,
        96,
        30,
        s,
        () => {
          ap.shape = s;
          this.save();
          Sound.device();
        },
        true,
        s === ap.shape ? '#2ee6a8' : undefined
      );
      sx += 104;
    }
    this.button(60, H - 70, 180, 44, '◀ BACK', () => (this.state = 'station'), true, '#7af5ff');
  }
  /* ---------------------------- SETTINGS --------------------------------- */
  applySettings() {
    const s = this.meta.settings;
    if (!s) return;
    this.fxScale = s.fxScale;
    if (AudioEngine.ready) {
      if (AudioEngine.master) AudioEngine.master.gain.value = 0.5 * s.master;
      if (Music.gain) Music.gain.gain.value = 0.3 * s.music * s.master;
    }
  }
  stepperRow(label, y, value, set) {
    const ctx = this.ctx;
    ctx.fillStyle = '#dff6ff';
    ctx.font = '14px monospace';
    ctx.fillText(label, 60, y + 20);
    this.button(280, y, 40, 30, '–', () => {
      set(Math.max(0, Math.round((value - 0.1) * 10) / 10));
      this.save();
      this.applySettings();
    });
    ctx.fillStyle = '#ffd35d';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(value * 100) + '%', 350, y + 20);
    ctx.textAlign = 'left';
    this.button(380, y, 40, 30, '+', () => {
      set(Math.min(1, Math.round((value + 0.1) * 10) / 10));
      this.save();
      this.applySettings();
    });
  }
  // Shared settings body (title + steppers + hint). Reused by the station
  // SETTINGS screen and the in-game pause menu so the code lives in one place.
  drawSettingsBody() {
    const ctx = this.ctx;
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SETTINGS', 60, 56);
    const s =
      this.meta.settings ||
      (this.meta.settings = { master: 0.8, music: 0.6, sfx: 0.9, fxScale: 1 });
    this.stepperRow('Master volume', 110, s.master, (v) => (s.master = v));
    this.stepperRow('Music volume', 160, s.music, (v) => (s.music = v));
    this.stepperRow('FX quality', 210, s.fxScale, (v) => (s.fxScale = v));
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '11px monospace';
    ctx.fillText('Lower FX quality if you see slowdowns in heavy fights.', 60, 320);
  }
  drawSettings() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.fillStyle = '#070d10';
    ctx.fillRect(0, 0, W, H);
    this.drawSettingsBody();
    this.button(60, H - 70, 180, 44, '◀ BACK', () => (this.state = 'station'), true, '#7af5ff');
  }
  /* ---------------------------- CLASS SELECT ----------------------------- */
  drawClassSelect() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.fillStyle = '#070d10';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('SELECT CLONE CLASS', 60, 56);
    const cur = this.meta.class || 'vanguard';
    const cardW = Math.min(260, (W - 200) / 4),
      gap = 20,
      total = CLASS_KEYS.length * cardW + (CLASS_KEYS.length - 1) * gap;
    let x = (W - total) / 2;
    const y = 120;
    for (const key of CLASS_KEYS) {
      const def = CLASSES[key];
      const sel = key === cur;
      this.button(
        x,
        y,
        cardW,
        180,
        '',
        () => {
          this.meta.class = key;
          this.save();
          Sound.device();
        },
        true,
        sel ? '#2ee6a8' : undefined
      );
      // avatar + name + 2-line tradeoff + ability
      drawClone(ctx, x + cardW / 2, y + 54, this.meta.appearance || defaultAppearance(), 1.8, 0, 0);
      ctx.fillStyle = sel ? '#2ee6a8' : '#dff6ff';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + cardW / 2, y + 104);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '10px monospace';
      this.wrapText(def.desc, x + cardW / 2, y + 126, cardW - 20, 13);
      ctx.fillStyle = '#ffd35d';
      ctx.fillText('Ability: ' + def.ability.name + ' [G]', x + cardW / 2, y + 166);
      ctx.textAlign = 'left';
      x += cardW + gap;
    }
    this.button(60, H - 70, 180, 44, '◀ BACK', () => (this.state = 'station'), true, '#7af5ff');
  }
  // tiny word-wrap helper for centered card text
  wrapText(text, cx, y, maxW, lh) {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '',
      yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = w;
        yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }
  /* ---------------------------- CONTRACT DRAFT --------------------------- */
  beginContract(seed) {
    const s = seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    // draw 3 distinct modifier choices, seeded so a daily run is reproducible
    const rng = makeRng(s ^ 0x9e3779b9);
    const pool = MODIFIER_KEYS.slice();
    const choices = [];
    while (choices.length < 3 && pool.length)
      choices.push(pool.splice((rng() * pool.length) | 0, 1)[0]);
    this.contract = { seed: s, choices, picked: [] };
    this.state = 'contract';
  }
  launchContract(mods) {
    const seed = this.contract ? this.contract.seed : undefined;
    this.startRun({ seed, modifiers: mods });
  }
  drawContract() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    const c = this.contract;
    ctx.fillStyle = '#070d10';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXPEDITION CONTRACT', W / 2, 56);
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText('Pick up to 2 mutators — higher risk, higher payout. Seed ' + c.seed, W / 2, 80);
    const agg = aggregate(c.picked);
    ctx.fillStyle = '#ffd35d';
    ctx.fillText('Payout ×' + agg.payoutMult.toFixed(2), W / 2, 100);
    ctx.textAlign = 'left';

    const cardW = 300,
      gap = 24,
      total = c.choices.length * cardW + (c.choices.length - 1) * gap;
    let x = (W - total) / 2;
    const y = 140;
    for (const id of c.choices) {
      const def = MODIFIERS[id];
      const picked = c.picked.includes(id);
      this.button(
        x,
        y,
        cardW,
        150,
        '',
        () => {
          const i = c.picked.indexOf(id);
          if (i >= 0) c.picked.splice(i, 1);
          else if (c.picked.length < 2) c.picked.push(id);
          Sound.device();
        },
        true,
        picked ? '#ff5d8a' : '#6e8bff'
      );
      ctx.fillStyle = picked ? '#ff5d8a' : '#dff6ff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + cardW / 2, y + 44);
      ctx.fillStyle = '#cfe0ea';
      ctx.font = '12px monospace';
      this.wrapText(def.desc, x + cardW / 2, y + 76, cardW - 30, 16);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '11px monospace';
      ctx.fillText(picked ? '✓ SELECTED' : 'click to select', x + cardW / 2, y + 132);
      ctx.textAlign = 'left';
      x += cardW + gap;
    }

    this.button(
      W / 2 - 250,
      H - 90,
      230,
      46,
      'QUICK DROP (no mutators)',
      () => this.launchContract([]),
      true
    );
    this.button(
      W / 2 + 20,
      H - 90,
      230,
      46,
      '▶ LAUNCH',
      () => this.launchContract(c.picked),
      c.picked.length > 0,
      '#2ee6a8'
    );
    this.button(60, H - 70, 150, 36, '◀ BACK', () => (this.state = 'station'), true, '#7af5ff');
  }
  drawWorld() {
    const ctx = this.ctx,
      cam = this.camera,
      W = this.canvas.width,
      H = this.canvas.height;
    // biome background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, this.biome.bgTop);
    bg.addColorStop(1, this.biome.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(60,120,100,0.07)';
    ctx.lineWidth = 1;
    const grid = 120;
    const gx0 = Math.floor(cam.x / grid) * grid;
    const gy0 = Math.floor(cam.y / grid) * grid;
    ctx.beginPath();
    for (let x = gx0; x < cam.x + W + grid; x += grid) {
      ctx.moveTo(cam.wx(x), 0);
      ctx.lineTo(cam.wx(x), H);
    }
    for (let y = gy0; y < cam.y + H + grid; y += grid) {
      ctx.moveTo(0, cam.wy(y));
      ctx.lineTo(W, cam.wy(y));
    }
    ctx.stroke();
    // world border
    ctx.strokeStyle = 'rgba(255,93,77,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(cam.wx(0), cam.wy(0), WORLD_W, WORLD_H);
    // decorations (bioluminescent swamp)
    const t = performance.now() / 1000;
    for (const d of this.deco) {
      const x = cam.wx(d.x),
        y = cam.wy(d.y);
      if (x < -80 || y < -80 || x > W + 80 || y > H + 80) continue;
      const p = Math.sin(t * 1.2 + d.ph) * 0.5 + 0.5;
      if (d.t === 0) {
        // glow puddle
        ctx.fillStyle = this.biome.deco.puddle + (0.04 + p * 0.04) + ')';
        ctx.beginPath();
        ctx.ellipse(x, y, d.r * 1.4, d.r * 0.8, 0, 0, TAU);
        ctx.fill();
      } else if (d.t === 1) {
        // glow plant
        ctx.strokeStyle = this.biome.deco.plant + (0.18 + p * 0.2) + ')';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i - 1.5) * 0.4 + Math.sin(t + d.ph + i) * 0.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(
            x + Math.cos(a) * d.r * 0.5,
            y + Math.sin(a) * d.r * 0.8,
            x + Math.cos(a) * d.r * 0.7,
            y + Math.sin(a) * d.r
          );
          ctx.stroke();
        }
        ctx.fillStyle = this.biome.deco.tip + (0.3 + p * 0.4) + ')';
        ctx.beginPath();
        ctx.arc(x, y - d.r * 0.7, 2.5, 0, TAU);
        ctx.fill();
      } else {
        // rock
        ctx.fillStyle = 'rgba(50,70,75,0.5)';
        ctx.beginPath();
        ctx.moveTo(x - d.r * 0.5, y + d.r * 0.3);
        ctx.lineTo(x, y - d.r * 0.4);
        ctx.lineTo(x + d.r * 0.5, y + d.r * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }
    // hazard zones (under entities)
    for (const hz of this.hazards) hz.draw(ctx, cam);
    // entities
    this.outpost.draw(ctx, cam);
    for (const m of this.mines) m.draw(ctx, cam);
    const revealed = this.scanRevealT > 0;
    for (const r of this.resources) r.draw(ctx, cam, revealed);
    for (const h of this.hives) h.draw(ctx, cam);
    if (this.mule) this.mule.draw(ctx, cam);
    for (const tr of this.turrets) tr.draw(ctx, cam);
    for (const dc of this.decoys) dc.draw(ctx, cam);
    for (const dr of this.drones) dr.draw(ctx, cam);
    for (const e of this.enemies) if (this.inView(e.x, e.y, 60)) e.draw(ctx, cam);
    if (this.boss) this.boss.draw(ctx, cam);
    if (!this.player.dead) this.player.draw(ctx, cam);
    for (const pr of this.projectiles) if (this.inView(pr.x, pr.y, 40)) pr.draw(ctx, cam);
    for (const pr of this.enemyProjectiles) if (this.inView(pr.x, pr.y, 40)) pr.draw(ctx, cam);
    // arc beam
    if (this.arcBeam) {
      ctx.strokeStyle = '#9ab2ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const pts = this.arcBeam.pts;
      ctx.moveTo(cam.wx(pts[0].x), cam.wy(pts[0].y));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i];
        const mx = (a.x + b.x) / 2 + rand(-8, 8),
          my = (a.y + b.y) / 2 + rand(-8, 8);
        ctx.quadraticCurveTo(cam.wx(mx), cam.wy(my), cam.wx(b.x), cam.wy(b.y));
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // scanner ring
    if (this.scanPulse) {
      const a = 1 - this.scanPulse.r / this.scanPulse.max;
      ctx.strokeStyle = 'rgba(122,245,255,' + a * 0.7 + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cam.wx(this.scanPulse.x), cam.wy(this.scanPulse.y), this.scanPulse.r, 0, TAU);
      ctx.stroke();
    }
    // EMP shockwave ring
    if (this.empPulse) {
      const a = 1 - this.empPulse.r / this.empPulse.max;
      ctx.strokeStyle = 'rgba(110,139,255,' + a * 0.8 + ')';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cam.wx(this.empPulse.x), cam.wy(this.empPulse.y), this.empPulse.r, 0, TAU);
      ctx.stroke();
    }
    // particles
    for (const pt of this.particles) if (this.inView(pt.x, pt.y, 30)) pt.draw(ctx, cam);
    // floating damage numbers
    for (const dn of this.damageNumbers) dn.draw(ctx, cam);
    // spore storm visibility veil (fades in/out with the event timer)
    if (this.run.event && this.run.event.type === 'sporeStorm') {
      const et = this.run.event.t;
      const a = Math.min(0.38, Math.min(et, this.run.event.max - et) * 0.2);
      ctx.fillStyle = 'rgba(120,80,170,' + Math.max(0, a) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // evac indicator
    if (this.evacuating) {
      const p = this.player;
      ctx.strokeStyle = '#2ee6a8';
      ctx.lineWidth = 4;
      const total = p.signal < 10 ? 8 : 4;
      const frac = 1 - this.evacT / total;
      ctx.beginPath();
      ctx.arc(cam.wx(p.x), cam.wy(p.y), p.radius + 26, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      ctx.fillStyle = '#aef5dc';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EVAC ' + this.evacT.toFixed(1) + 's', cam.wx(p.x), cam.wy(p.y) - p.radius - 34);
      ctx.textAlign = 'left';
    }
  }
  /* ------------------------------ HUD ------------------------------------ */
  glitch() {
    const p = this.player;
    if (p && p.signal < 30 && Math.random() < 0.15) return { x: rand(-2.5, 2.5), y: rand(-2, 2) };
    return { x: 0, y: 0 };
  }
  bar(ctx, x, y, w, h, frac, color, label, valText) {
    ctx.fillStyle = 'rgba(8,16,20,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(frac, 0, 1), h - 2);
    ctx.strokeStyle = 'rgba(180,220,230,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '10px monospace';
    ctx.fillText(label, x + 4, y + h - 4);
    if (valText) {
      ctx.textAlign = 'right';
      ctx.fillText(valText, x + w - 4, y + h - 4);
      ctx.textAlign = 'left';
    }
  }
  drawHUD() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    const p = this.player,
      r = this.run;
    const gl = this.glitch();
    ctx.save();
    ctx.translate(gl.x, gl.y);

    // left bars
    let y = 14;
    const bw = 190,
      bh = 16;
    this.bar(
      ctx,
      14,
      y,
      bw,
      bh,
      p.health / p.maxHealth,
      '#3ddc6a',
      'HP',
      Math.ceil(p.health) + '/' + p.maxHealth
    );
    y += bh + 4;
    this.bar(ctx, 14, y, bw, bh, 1, '#8aa3b5', 'ARMOR', p.armor.toString());
    y += bh + 4;
    this.bar(
      ctx,
      14,
      y,
      bw,
      bh,
      p.energy / p.maxEnergy,
      '#ffd35d',
      'ENERGY',
      Math.floor(p.energy) + ''
    );
    y += bh + 4;
    const sigColor = p.signal > 60 ? '#7af5ff' : p.signal > 30 ? '#ffd35d' : '#ff5d4d';
    this.bar(ctx, 14, y, bw, bh, p.signal / 100, sigColor, 'SIGNAL', Math.floor(p.signal) + '%');
    y += bh + 10;

    // weapon
    const ws = p.weapons[p.weaponKey],
      def = ws.def;
    ctx.fillStyle = 'rgba(8,16,20,0.75)';
    ctx.fillRect(14, y, bw, 40);
    ctx.strokeStyle = 'rgba(180,220,230,0.35)';
    ctx.strokeRect(14, y, bw, 40);
    ctx.fillStyle = def.color;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('[' + (p.slots.indexOf(p.weaponKey) + 1) + '] ' + def.name, 20, y + 16);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    if (def.useHeat) {
      const txt = ws.overheated ? 'OVERHEAT!' : 'HEAT ' + Math.floor(ws.heat) + '%';
      ctx.fillText(txt, 20, y + 32);
      ctx.fillStyle = ws.overheated ? '#ff5d4d' : '#6e8bff';
      ctx.fillRect(95, y + 24, 100 * (ws.heat / 100), 8);
    } else if (ws.reloadT > 0) {
      ctx.fillText('RELOADING...', 20, y + 32);
    } else {
      ctx.fillText('AMMO ' + ws.ammo + '/' + def.magSize + '  [R]', 20, y + 32);
    }
    y += 48;

    // devices (from the equipped loadout)
    const devKeyLabels = ['Q', 'F', 'C', 'X'];
    const devs = p.deviceSlots.map((k, i) => [devKeyLabels[i], DEVICES[k].name, p.dev[k]]);
    let dx = 14;
    for (const [key, name, cd] of devs) {
      const ready = cd <= 0;
      ctx.fillStyle = ready ? 'rgba(20,46,40,0.85)' : 'rgba(8,16,20,0.75)';
      ctx.fillRect(dx, y, 44, 34);
      ctx.strokeStyle = ready ? '#2ee6a8' : 'rgba(120,140,150,0.4)';
      ctx.strokeRect(dx, y, 44, 34);
      ctx.fillStyle = ready ? '#aef5dc' : '#7a8b99';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(key, dx + 4, y + 13);
      ctx.font = '9px monospace';
      ctx.fillText(ready ? name : Math.ceil(cd) + 's', dx + 4, y + 27);
      dx += 48;
    }
    y += 42;

    // carry
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    ctx.fillText(
      'Carry: ' +
        p.carryWeight() +
        '/' +
        p.carryCapacity +
        ' weight  •  Delivered: ' +
        r.deliveredValue +
        ' cr',
      14,
      y + 10
    );
    y += 16;
    // carried items summary
    const counts = {};
    for (const k of p.carry) counts[k] = (counts[k] || 0) + 1;
    let cx = 14;
    for (const k in counts) {
      ctx.fillStyle = RESOURCE_TYPES[k].color;
      ctx.fillText('◆' + counts[k], cx, y + 10);
      cx += 34;
    }
    y += 18;
    // mule
    if (this.mule && !this.mule.dead) {
      ctx.fillStyle = '#bfe6cf';
      ctx.fillText(
        'Mule-3: ' +
          Math.ceil(this.mule.hp) +
          '/' +
          this.mule.maxHp +
          ' HP  •  slots ' +
          this.mule.cargo.length +
          '/' +
          this.mule.cargoSlots,
        14,
        y + 10
      );
    } else {
      ctx.fillStyle = '#ff8d8d';
      ctx.fillText('Mule-3: DESTROYED', 14, y + 10);
    }

    // top center: mission + threat + timer
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,16,20,0.7)';
    const mw = 520;
    ctx.fillRect(W / 2 - mw / 2, 10, mw, 58);
    ctx.strokeStyle = 'rgba(180,220,230,0.3)';
    ctx.strokeRect(W / 2 - mw / 2, 10, mw, 58);
    ctx.fillStyle = '#ffd35d';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      this.mission.def.name + (this.mission.complete ? ' ✔ COMPLETE — evacuate [V]' : ''),
      W / 2,
      28
    );
    ctx.fillStyle = '#dff6ff';
    ctx.font = '12px monospace';
    ctx.fillText(this.mission.objectiveText(), W / 2, 45);
    // threat: a drawn segmented bar clamped to the panel's inner width (never
    // overflows). Label on the left, timer on the right, segments between.
    const tl = this.threatLevel();
    const pad = 14;
    const innerL = W / 2 - mw / 2 + pad;
    const innerR = W / 2 + mw / 2 - pad;
    const threatColor = tl >= 4 ? '#ff4f5e' : tl >= 2 ? '#ffb02e' : '#7af5ff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = threatColor;
    ctx.fillText('THREAT ' + tl + '/5', innerL, 61);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#dff6ff';
    ctx.fillText('⏱ ' + fmtTime(r.time), innerR, 61);
    ctx.textAlign = 'left';
    // segmented bar in the space between the two labels
    const barX = innerL + 96;
    const barRight = innerR - 70;
    const n = 5,
      gap = 4;
    const segW = Math.max(4, Math.floor((barRight - barX - gap * (n - 1)) / n));
    for (let i = 0; i < n; i++) {
      const sx = barX + i * (segW + gap);
      if (sx + segW > barRight + 0.5) break; // guarantee containment
      if (i < tl) {
        // filled segments ramp warning → danger toward 5; top one pulses gently
        ctx.fillStyle = i >= 3 ? '#ff4f5e' : '#ffb02e';
        ctx.globalAlpha =
          i === tl - 1 ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(performance.now() / 350)) : 1;
        ctx.fillRect(sx, 53, segW, 10);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = 'rgba(125,164,179,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, 53.5, segW - 1, 9);
      }
    }
    // boss healthbar (below the mission banner)
    if (this.boss && !this.boss.dead) {
      const bw2 = Math.min(520, W * 0.5);
      ctx.fillStyle = 'rgba(8,16,20,0.75)';
      ctx.fillRect(W / 2 - bw2 / 2, 74, bw2, 16);
      ctx.fillStyle = '#b02040';
      ctx.fillRect(
        W / 2 - bw2 / 2 + 1,
        75,
        (bw2 - 2) * clamp(this.boss.hp / this.boss.maxHp, 0, 1),
        14
      );
      ctx.strokeStyle = 'rgba(255,125,160,0.5)';
      ctx.strokeRect(W / 2 - bw2 / 2, 74, bw2, 16);
      ctx.fillStyle = '#ffd9e6';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('APEX WARDEN', W / 2, 85);
    }
    // combo multiplier (right of the mission banner)
    if (r.combo >= 2) {
      const cxx = W / 2 + mw / 2 + 78;
      ctx.fillStyle = r.comboMult >= 2 ? '#ffd35d' : '#aef5dc';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('x' + r.comboMult.toFixed(1), cxx, 30);
      ctx.font = '10px monospace';
      ctx.fillText('COMBO ' + r.combo, cxx, 44);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cxx - 30, 50, 60, 4);
      ctx.fillStyle = '#aef5dc';
      ctx.fillRect(cxx - 30, 50, 60 * clamp(r.comboT / 4, 0, 1), 4);
    }
    ctx.textAlign = 'left';

    // Overdrive (ULT) meter — bottom-center
    {
      const ow = 220,
        ox2 = W / 2 - ow / 2,
        oy2 = H - 40;
      const active = r.odActive > 0;
      const frac = active ? r.odActive / 6 : (r.odCharge || 0) / 100;
      ctx.fillStyle = 'rgba(8,16,20,0.8)';
      ctx.fillRect(ox2, oy2, ow, 12);
      ctx.fillStyle = active ? '#ff5d8a' : r.odCharge >= 100 ? '#ffd35d' : '#6e8bff';
      ctx.fillRect(ox2 + 1, oy2 + 1, (ow - 2) * clamp(frac, 0, 1), 10);
      ctx.strokeStyle = 'rgba(180,220,230,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox2, oy2, ow, 12);
      ctx.fillStyle = '#dff6ff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        active ? 'OVERDRIVE!' : r.odCharge >= 100 ? 'OVERDRIVE READY [Space]' : 'OVERDRIVE',
        W / 2,
        oy2 + 9
      );
      ctx.textAlign = 'left';
    }
    // class ability pip (bottom-right)
    if (p.ability) {
      const ready = p.abilityT <= 0;
      ctx.fillStyle = ready ? '#2ee6a8' : 'rgba(120,140,150,0.5)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        ready ? '[G] ' + p.ability.name : '[G] ' + Math.ceil(p.abilityT) + 's',
        W - 16,
        H - 30
      );
      ctx.textAlign = 'left';
    }

    // toasts
    let ty = H - 120;
    ctx.font = '12px monospace';
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const ts = this.toasts[i];
      ctx.globalAlpha = clamp(ts.t, 0, 1);
      ctx.fillStyle = 'rgba(8,20,24,0.8)';
      const tw = ctx.measureText(ts.msg).width + 16;
      ctx.fillRect(W / 2 - tw / 2, ty, tw, 20);
      ctx.fillStyle = '#dff6ff';
      ctx.textAlign = 'center';
      ctx.fillText(ts.msg, W / 2, ty + 14);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      ty -= 24;
    }

    // controls hint
    ctx.fillStyle = 'rgba(190,220,230,0.45)';
    ctx.font = '10px monospace';
    ctx.fillText(
      'WASD move • LMB fire • E interact • Shift dash • V evacuate • M map • Esc pause',
      14,
      H - 10
    );

    // minimap
    if (this.showMinimap) this.drawMinimap();
    if (this.showStats) this.drawStatsOverlay();
    ctx.restore();
  }
  drawMinimap() {
    const ctx = this.ctx,
      W = this.canvas.width;
    const size = 170,
      mx = W - size - 14,
      my = 14;
    const sc = size / WORLD_W;
    ctx.fillStyle = 'rgba(6,14,12,0.8)';
    ctx.fillRect(mx, my, size, size);
    ctx.strokeStyle = 'rgba(122,245,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, size, size);
    // outpost
    ctx.fillStyle = this.outpost.active ? '#2ee6a8' : '#8aa3b5';
    ctx.fillRect(mx + this.outpost.x * sc - 3, my + this.outpost.y * sc - 3, 6, 6);
    // hives
    for (const h of this.hives) {
      if (h.destroyed) continue;
      ctx.fillStyle = '#ff5d8a';
      ctx.beginPath();
      ctx.arc(mx + h.x * sc, my + h.y * sc, 2 + h.level, 0, TAU);
      ctx.fill();
    }
    // mule
    if (this.mule && !this.mule.dead) {
      ctx.fillStyle = '#5dffc8';
      ctx.fillRect(mx + this.mule.x * sc - 2, my + this.mule.y * sc - 2, 4, 4);
    }
    // scanned resources + enemies
    if (this.scanRevealT > 0) {
      for (const r of this.resources) {
        ctx.fillStyle = RESOURCE_TYPES[r.type].color;
        ctx.fillRect(mx + r.x * sc - 1, my + r.y * sc - 1, 2, 2);
      }
      ctx.fillStyle = '#ff5d4d';
      for (const e of this.enemies) {
        ctx.fillRect(mx + e.x * sc - 1, my + e.y * sc - 1, 2, 2);
      }
    }
    // player
    const p = this.player;
    ctx.fillStyle = '#7af5ff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sc, my + p.y * sc, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,220,230,0.6)';
    ctx.font = '9px monospace';
    ctx.fillText('MORROW FEN [M]', mx + 4, my + size - 5);
  }
  drawStatsOverlay() {
    const ctx = this.ctx,
      W = this.canvas.width;
    const x = W - 230,
      y = 200,
      w = 216;
    ctx.fillStyle = 'rgba(6,14,16,0.85)';
    ctx.fillRect(x, y, w, 150);
    ctx.strokeStyle = 'rgba(122,245,255,0.35)';
    ctx.strokeRect(x, y, w, 150);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('RUN STATS [Tab]', x + 8, y + 16);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    const r = this.run;
    const lines = [
      'Kills: ' + r.kills,
      'Hives destroyed: ' + r.hivesDestroyed,
      'Delivered: ' + r.deliveredValue + ' cr',
      'Threat: ' + r.threat.toFixed(1) + '/5',
      'Score: ' + r.score,
      'Station credits: ' + this.meta.credits,
    ];
    lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 36 + i * 18));
  }
  /* ------------------------------ UI BUTTONS ----------------------------- */
  button(x, y, w, h, label, cb, enabled, color) {
    const ctx = this.ctx;
    const hover =
      Input.mouseX >= x && Input.mouseX <= x + w && Input.mouseY >= y && Input.mouseY <= y + h;
    const en = enabled !== false;
    ctx.fillStyle = en
      ? hover
        ? 'rgba(46,230,168,0.25)'
        : 'rgba(20,40,38,0.85)'
      : 'rgba(20,26,30,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = en ? color || '#2ee6a8' : 'rgba(110,130,140,0.4)';
    ctx.lineWidth = hover && en ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = en ? '#dffff2' : '#7a8b99';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
    if (hover && en && Input.mouseClicked) cb();
  }
  /* ------------------------------ STATION -------------------------------- */
  drawStation() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    const m = this.meta;
    // starfield bg
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#070b14');
    bg.addColorStop(1, '#0a1410');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const t = performance.now() / 1000;
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5) % W,
        sy = (i * 89.3) % H;
      const tw = Math.sin(t * 2 + i) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(200,230,255,' + (0.15 + tw * 0.3) + ')';
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    // planet
    const px = W * 0.85,
      py = H * 0.8;
    const pg = ctx.createRadialGradient(px - 30, py - 30, 20, px, py, 160);
    pg.addColorStop(0, '#1f5a48');
    pg.addColorStop(1, '#0a2018');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, 160, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(93,255,160,0.12)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(px + Math.sin(i * 2.3) * 80, py + Math.cos(i * 1.7) * 80, 38, 14, i, 0, TAU);
      ctx.fill();
    }

    // header
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('PALE HARBOR STATION', 40, 50);
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText(
      'Morrow Fen orbit • Year 2184 • Runs: ' + m.runCount + ' • Best: ' + m.bestScore,
      40,
      70
    );

    // credits + resources
    ctx.fillStyle = '#ffd35d';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('CREDITS: ' + m.credits, 40, 100);
    let rx = 40;
    ctx.font = '12px monospace';
    for (const k in RESOURCE_TYPES) {
      ctx.fillStyle = RESOURCE_TYPES[k].color;
      const txt =
        RESOURCE_TYPES[k].name + ': ' + m.resources[k] + '  (price ' + this.sellPrice(k) + ')';
      ctx.fillText('◆ ' + txt, rx, 122);
      rx += ctx.measureText('◆ ' + txt).width + 22;
      if (rx > W - 260) {
        rx = 40;
      }
    }

    // upgrades panel
    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('STATION UPGRADES', 40, 158);
    const keys = Object.keys(UPGRADES);
    const colW = Math.min(440, (W - 100) / 2);
    keys.forEach((k, i) => {
      const def = UPGRADES[k];
      const lvl = m.upgrades[k];
      const col = i % 2,
        row = Math.floor(i / 2);
      const x = 40 + col * (colW + 20);
      const y = 172 + row * 78;
      ctx.fillStyle = 'rgba(12,22,26,0.85)';
      ctx.fillRect(x, y, colW, 70);
      ctx.strokeStyle = 'rgba(122,245,255,0.25)';
      ctx.strokeRect(x, y, colW, 70);
      ctx.fillStyle = '#aef5dc';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(def.name + '  [' + lvl + '/' + def.max + ']', x + 10, y + 18);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '11px monospace';
      ctx.fillText(def.desc, x + 10, y + 34);
      if (lvl < def.max) {
        const c = this.upgradeCost(k);
        let costStr = c.credits + ' cr';
        for (const r in c.res) costStr += ' + ' + c.res[r] + ' ' + RESOURCE_TYPES[r].name;
        ctx.fillStyle = this.canBuy(k) ? '#ffd35d' : '#7a6a50';
        ctx.fillText(costStr, x + 10, y + 52);
        this.button(x + colW - 92, y + 38, 82, 24, 'BUY', () => this.buyUpgrade(k), this.canBuy(k));
      } else {
        ctx.fillStyle = '#2ee6a8';
        ctx.fillText('MAXED', x + 10, y + 52);
      }
    });

    // loadout (weapons on 1/2/3, devices on Q/F/C/X — click to cycle)
    const loy = 172 + Math.ceil(Object.keys(UPGRADES).length / 2) * 78 + 14;
    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('LOADOUT', 40, loy);
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '11px monospace';
    ctx.fillText('click to cycle', 130, loy);
    const lo = m.loadout;
    for (let i = 0; i < 3; i++) {
      const wi = i; // capture
      this.button(
        40 + i * 152,
        loy + 10,
        142,
        26,
        '[' + (i + 1) + '] ' + WEAPONS[lo.weapons[i]].name,
        () => {
          lo.weapons[wi] = cycleChoice(
            WEAPON_CHOICES,
            lo.weapons[wi],
            1,
            lo.weapons.filter((_, j) => j !== wi)
          );
          this.save();
        },
        true,
        WEAPONS[lo.weapons[i]].color
      );
    }
    const devLabels = ['Q', 'F', 'C', 'X'];
    for (let i = 0; i < 4; i++) {
      const di = i; // capture
      this.button(
        40 + i * 152,
        loy + 42,
        142,
        26,
        devLabels[i] + ': ' + DEVICES[lo.devices[i]].name,
        () => {
          lo.devices[di] = cycleChoice(
            DEVICE_CHOICES,
            lo.devices[di],
            1,
            lo.devices.filter((_, j) => j !== di)
          );
          this.save();
        },
        true
      );
    }

    // top-right: profile actions
    this.button(W - 480, 30, 110, 30, 'CLASS', () => (this.state = 'classsel'), true, '#2ee6a8');
    this.button(
      W - 360,
      30,
      110,
      30,
      'CUSTOMIZE',
      () => (this.state = 'customize'),
      true,
      '#b06bff'
    );
    this.button(W - 240, 30, 110, 30, 'SETTINGS', () => (this.state = 'settings'), true, '#ffd35d');
    this.button(
      W - 120,
      30,
      90,
      30,
      'SWITCH',
      () => {
        this.save();
        this.activeProfile = null;
        this.loginMode = 'select';
        this.state = 'login';
      },
      true,
      '#ff8d8d'
    );

    // start button
    this.button(
      W / 2 - 150,
      H - 80,
      300,
      46,
      '▶ START NEW EXPEDITION',
      () => this.beginContract(),
      true,
      '#7af5ff'
    );
    ctx.fillStyle = 'rgba(190,220,230,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      'A Vanguard clone will be dropped on Morrow Fen. The mission is chosen at random.',
      W / 2,
      H - 24
    );
    ctx.textAlign = 'left';
  }
  /* ------------------------------ PAUSE ----------------------------------- */
  drawPause() {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    ctx.fillStyle = 'rgba(4,8,10,0.78)';
    ctx.fillRect(0, 0, W, H);
    // settings sub-view (reuses the shared settings body; BACK → pause menu)
    if (this.pauseView === 'settings') {
      this.drawSettingsBody();
      this.button(60, H - 70, 180, 44, '◀ BACK', () => (this.pauseView = 'menu'), true, '#7af5ff');
      return;
    }
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2 - 110);
    ctx.textAlign = 'left';
    this.button(W / 2 - 130, H / 2 - 70, 260, 40, 'RESUME [Esc]', () => (this.state = 'playing'));
    this.button(
      W / 2 - 130,
      H / 2 - 22,
      260,
      40,
      'SETTINGS',
      () => (this.pauseView = 'settings'),
      true,
      '#ffd35d'
    );
    this.button(W / 2 - 130, H / 2 + 26, 260, 40, 'RESTART EXPEDITION', () => this.startRun());
    this.button(
      W / 2 - 130,
      H / 2 + 74,
      260,
      40,
      'RETURN TO STATION',
      () => {
        // abandoning run: deliveries are kept
        this.finishRun(true);
        this.state = 'station';
      },
      true,
      '#ff8d8d'
    );
  }
  /* ------------------------------ END SCREENS ----------------------------- */
  drawEnd(died) {
    const ctx = this.ctx,
      W = this.canvas.width,
      H = this.canvas.height;
    const s = this.endSummary;
    if (!s) {
      this.state = 'station';
      return;
    }
    ctx.fillStyle = 'rgba(4,8,10,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (died) {
      ctx.fillStyle = '#ff5d4d';
      ctx.font = 'bold 34px monospace';
      ctx.fillText('CLONE LOST', W / 2, H / 2 - 150);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '13px monospace';
      ctx.fillText(
        'Contact with the clone was lost. Delivered cargo is kept by the station.',
        W / 2,
        H / 2 - 122
      );
    } else {
      ctx.fillStyle = s.missionComplete ? '#2ee6a8' : '#ffd35d';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(
        s.missionComplete ? 'MISSION COMPLETE' : 'PARTIAL EXTRACTION',
        W / 2,
        H / 2 - 150
      );
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '13px monospace';
      ctx.fillText('The clone returned to Pale Harbor station.', W / 2, H / 2 - 122);
    }
    ctx.fillStyle = '#dff6ff';
    ctx.font = '14px monospace';
    const lines = [
      'Mission: ' +
        s.missionName +
        (s.missionComplete ? ' — complete' : ' — failed') +
        (s.missionBonus ? ' (+bonus!)' : ''),
      'Time: ' + fmtTime(s.time) + '   Kills: ' + s.kills + '   Hives: ' + s.hives,
      'Delivered: ' + s.deliveredValue + ' cr',
      'Credits: +' + s.credits + (s.bonusCr ? '  (mission bonus +' + s.bonusCr + ')' : ''),
      s.hydro ? 'Hydroponics: +' + s.hydro + ' Bio Resin' : '',
      'Score: ' + s.score + '   Best: ' + this.meta.bestScore,
    ].filter(Boolean);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 80 + i * 26));
    // delivered breakdown
    let dl = 'Delivered: ';
    const dk = Object.keys(s.delivered);
    if (dk.length === 0) dl += 'nothing';
    else dl += dk.map((k) => RESOURCE_TYPES[k].name + ' ×' + s.delivered[k]).join(', ');
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText(dl, W / 2, H / 2 + 86);
    ctx.textAlign = 'left';
    this.button(W / 2 - 130, H / 2 + 110, 260, 42, 'TO STATION', () => {
      this.state = 'station';
    });
  }
}

export { Game };
