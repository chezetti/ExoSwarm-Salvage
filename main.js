'use strict';
/* =========================================================================
   ExoSwarm Salvage — top-down sci-fi survival roguelite shooter
   Vanilla JS + Canvas 2D, no libs, no assets. Single file.
   ========================================================================= */

/* ============================== UTILS =================================== */
const TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.hypot(dx, dy); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ============================== AUDIO =================================== */
const Sound = {
  ctx: null, master: null, enabled: true,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  blip(freq, dur, type, vol, slide) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.4;
    src.connect(g); g.connect(this.master);
    src.start(t);
  },
  shoot() { this.blip(720, 0.07, 'square', 0.25, -500); },
  shotgun() { this.noise(0.18, 0.5); this.blip(180, 0.12, 'sawtooth', 0.3, -120); },
  arc() { this.blip(rand(900, 1300), 0.05, 'sawtooth', 0.12, -300); },
  hit() { this.blip(220, 0.06, 'triangle', 0.3, -80); },
  enemyDie() { this.blip(140, 0.18, 'sawtooth', 0.35, -100); this.noise(0.1, 0.2); },
  pickup() { this.blip(880, 0.08, 'sine', 0.35, 300); },
  deliver() { this.blip(520, 0.1, 'sine', 0.35, 0); this.blip(780, 0.14, 'sine', 0.3, 200); },
  hurt() { this.blip(110, 0.2, 'square', 0.4, -60); },
  alarm() { this.blip(440, 0.25, 'square', 0.3, 120); this.blip(330, 0.25, 'square', 0.25, -60); },
  hiveDie() { this.noise(0.5, 0.6); this.blip(90, 0.5, 'sawtooth', 0.5, -50); },
  explosion() { this.noise(0.35, 0.7); this.blip(70, 0.3, 'sine', 0.6, -30); },
  reload() { this.blip(300, 0.06, 'square', 0.2, 100); },
  device() { this.blip(600, 0.12, 'triangle', 0.3, 200); },
  evac() { this.blip(660, 0.3, 'sine', 0.3, 220); }
};

/* ============================== DATA ==================================== */
const WORLD_W = 3000, WORLD_H = 3000;

const RESOURCE_TYPES = {
  bioResin:    { name: 'Bio Resin',     color: '#5dff7a', glow: 'rgba(93,255,122,',  weight: 1, price: 12 },
  sporeFiber:  { name: 'Spore Fiber',   color: '#b06bff', glow: 'rgba(176,107,255,', weight: 2, price: 20 },
  salvageChips:{ name: 'Salvage Chips', color: '#d8dde6', glow: 'rgba(216,221,230,', weight: 1, price: 10 },
  softQuartz:  { name: 'Soft Quartz',   color: '#6bd1ff', glow: 'rgba(107,209,255,', weight: 3, price: 28 },
  hiveEnzymes: { name: 'Hive Enzymes',  color: '#ff5d8a', glow: 'rgba(255,93,138,',  weight: 2, price: 65 }
};

const WEAPONS = {
  pulse: {
    key: 'pulse', name: 'Pulse Rifle', slot: 1,
    damage: 12, fireRate: 8, magSize: 36, reloadTime: 1.5,
    projSpeed: 760, projRadius: 3, spread: 0.04, pellets: 1,
    color: '#4df0ff', useHeat: false
  },
  shotgun: {
    key: 'shotgun', name: 'Shotgun', slot: 2,
    damage: 8, fireRate: 1.1, magSize: 6, reloadTime: 1.8,
    projSpeed: 640, projRadius: 3, spread: 0.34, pellets: 7,
    color: '#ffb04d', useHeat: false
  },
  arc: {
    key: 'arc', name: 'Arc Projector', slot: 3,
    damage: 7, tickRate: 10, range: 180, chain: 3, chainRange: 120,
    heatPerSec: 32, coolPerSec: 42, overheatLock: 30,
    color: '#6e8bff', useHeat: true
  }
};

const ENEMY_TYPES = {
  skitterling: {
    name: 'Skitterling', hp: 35, speed: 120, damage: 8, attackCd: 0.8,
    radius: 11, range: 22, color: '#ff5d4d', score: 4, kind: 'melee'
  },
  sporeMantis: {
    name: 'Spore Mantis', hp: 90, speed: 75, damage: 14, attackCd: 1.5,
    radius: 14, range: 260, color: '#c06bff', score: 9, kind: 'ranged'
  },
  carapaceBull: {
    name: 'Carapace Bull', hp: 280, speed: 65, damage: 28, attackCd: 1.4,
    radius: 22, range: 30, color: '#ff9a3d', score: 18, kind: 'charger', armor: 0.35
  },
  broodWarden: {
    name: 'Brood Warden', hp: 380, speed: 50, damage: 18, attackCd: 1.2,
    radius: 25, range: 34, color: '#b02040', score: 28, kind: 'warden'
  }
};

const UPGRADES = {
  cloneHealth: {
    name: 'Reinforced Clone Tissue', desc: '+20 макс. здоровья клона',
    credits: 120, res: { bioResin: 10 }, max: 5
  },
  rifleDamage: {
    name: 'Rifle Capacitor', desc: '+15% урон Pulse Rifle',
    credits: 150, res: { softQuartz: 8 }, max: 5
  },
  cargoHarness: {
    name: 'Cargo Harness', desc: '+2 переносимого веса',
    credits: 100, res: { salvageChips: 10 }, max: 5
  },
  muleArmor: {
    name: 'Mule Armor', desc: '+100 HP транспорта Mule-3',
    credits: 160, res: { salvageChips: 15 }, max: 5
  },
  deviceCooling: {
    name: 'Device Cooling', desc: '-15% перезарядка устройств',
    credits: 140, res: { sporeFiber: 8 }, max: 4
  },
  marketContacts: {
    name: 'Market Contacts', desc: '+10% к цене продажи ресурсов',
    credits: 200, res: {}, max: 4
  },
  signalArray: {
    name: 'Signal Array', desc: 'Signal Stability падает на 25% медленнее',
    credits: 130, res: { softQuartz: 6 }, max: 3
  },
  hydroponicsTray: {
    name: 'Hydroponics Tray', desc: '+3 Bio Resin после каждой миссии',
    credits: 180, res: { bioResin: 12 }, max: 3
  }
};

const MISSIONS = {
  resourceRun: {
    key: 'resourceRun', name: 'Resource Run',
    brief: 'Доставить на Cargo Pad ресурсов на 120 cr.',
    bonusBrief: 'Бонус: доставить 200+ cr.'
  },
  hivePurge: {
    key: 'hivePurge', name: 'Hive Purge',
    brief: 'Уничтожить 2 улья.',
    bonusBrief: 'Бонус: уничтожить улей 3 уровня.'
  },
  outpostRecovery: {
    key: 'outpostRecovery', name: 'Outpost Recovery',
    brief: 'Активировать реактор, доставить 60 cr и продержаться 90 с.',
    bonusBrief: 'Бонус: Mule-3 должен выжить.'
  }
};

/* ============================== INPUT =================================== */
const Input = {
  keys: {}, pressed: {},
  mouseX: 0, mouseY: 0, mouseDown: false, mouseClicked: false,
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (['Tab', ' '].includes(e.key)) e.preventDefault();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      Sound.init();
    });
    window.addEventListener('keyup', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
    });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      Sound.init();
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },
  wasPressed(k) { return !!this.pressed[k]; },
  endFrame() { this.pressed = {}; this.mouseClicked = false; }
};

/* ============================== CAMERA ================================== */
class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; this.sx = 0; this.sy = 0; }
  follow(tx, ty, dt, vw, vh) {
    this.x = lerp(this.x, tx - vw / 2, clamp(dt * 6, 0, 1));
    this.y = lerp(this.y, ty - vh / 2, clamp(dt * 6, 0, 1));
    this.x = clamp(this.x, -200, WORLD_W - vw + 200);
    this.y = clamp(this.y, -200, WORLD_H - vh + 200);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 14);
      this.sx = rand(-1, 1) * this.shake;
      this.sy = rand(-1, 1) * this.shake;
    } else { this.sx = 0; this.sy = 0; }
  }
  addShake(v) { this.shake = Math.min(14, this.shake + v); }
  wx(x) { return x - this.x + this.sx; }
  wy(y) { return y - this.y + this.sy; }
  toWorldX(sx) { return sx + this.x - this.sx; }
  toWorldY(sy) { return sy + this.y - this.sy; }
}

/* ============================= PARTICLES ================================ */
class Particle {
  constructor(x, y, vx, vy, life, size, color, fade) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.size = size;
    this.color = color; this.fade = fade !== false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= (1 - dt * 2); this.vy *= (1 - dt * 2);
    this.life -= dt;
    return this.life > 0;
  }
  draw(ctx, cam) {
    const a = this.fade ? clamp(this.life / this.maxLife, 0, 1) : 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(cam.wx(this.x), cam.wy(this.y), this.size * (0.4 + 0.6 * a), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function burst(game, x, y, color, n, speed, size, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(speed * 0.3, speed);
    game.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s,
      rand(life * 0.5, life), rand(size * 0.5, size), color));
  }
}

/* ============================ PROJECTILE ================================ */
class Projectile {
  constructor(x, y, angle, speed, damage, radius, color, friendly, range) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage; this.radius = radius; this.color = color;
    this.friendly = friendly;
    this.life = (range || 700) / speed;
    this.dead = false;
    this.prevX = x; this.prevY = y;
  }
  update(dt, game) {
    this.prevX = this.x; this.prevY = this.y;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < -50 || this.y < -50 || this.x > WORLD_W + 50 || this.y > WORLD_H + 50) this.dead = true;
  }
  draw(ctx, cam) {
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.radius;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cam.wx(this.prevX), cam.wy(this.prevY));
    ctx.lineTo(cam.wx(this.x), cam.wy(this.y));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cam.wx(this.x), cam.wy(this.y), this.radius * 0.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* =============================== PLAYER ================================= */
class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 14;
    const m = game.meta;
    this.maxHealth = 120 + 20 * m.upgrades.cloneHealth;
    this.health = this.maxHealth;
    this.armor = 35;
    this.maxEnergy = 100;
    this.energy = 100;
    this.speed = 220;
    this.dashCooldownMax = 1.6;
    this.dashCd = 0;
    this.dashTime = 0;
    this.carryCapacity = 6 + 2 * m.upgrades.cargoHarness;
    this.magnetRange = 28;
    this.carry = []; // array of resource type keys
    this.signal = 100;
    this.aim = 0;
    this.weaponKey = 'pulse';
    this.weapons = {};
    for (const k in WEAPONS) {
      const w = WEAPONS[k];
      this.weapons[k] = {
        def: w,
        ammo: w.useHeat ? 0 : w.magSize,
        heat: 0, overheated: false,
        reloadT: 0, cooldownT: 0
      };
    }
    this.devCdMult = 1 - 0.15 * m.upgrades.deviceCooling;
    this.dev = { turret: 0, shield: 0, scanner: 0, mine: 0 };
    this.shield = null; // {hp, t}
    this.invuln = 0;
    this.dead = false;
    this.hitFlash = 0;
    this.muzzle = 0;
  }
  carryWeight() {
    let w = 0;
    for (const k of this.carry) w += RESOURCE_TYPES[k].weight;
    return w;
  }
  damageMult(weaponKey) {
    if (weaponKey === 'pulse') return 1 + 0.15 * this.game.meta.upgrades.rifleDamage;
    return 1;
  }
  update(dt) {
    const g = this.game, inp = Input;
    // movement
    let mx = 0, my = 0;
    if (inp.keys['w']) my -= 1;
    if (inp.keys['s']) my += 1;
    if (inp.keys['a']) mx -= 1;
    if (inp.keys['d']) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    let spd = this.speed * (1 - 0.04 * this.carryWeight() / Math.max(1, this.carryCapacity) * 4);
    spd = Math.max(this.speed * 0.7, spd);

    this.dashCd = Math.max(0, this.dashCd - dt);
    if (inp.wasPressed('Shift') && this.dashCd <= 0 && this.energy >= 25 && len > 0) {
      this.dashCd = this.dashCooldownMax;
      this.dashTime = 0.18;
      this.energy -= 25;
      this.invuln = Math.max(this.invuln, 0.25);
      Sound.device();
      burst(g, this.x, this.y, '#7af5ff', 8, 120, 3, 0.4);
    }
    if (this.dashTime > 0) { spd *= 3.1; this.dashTime -= dt; }

    this.x = clamp(this.x + mx * spd * dt, this.radius, WORLD_W - this.radius);
    this.y = clamp(this.y + my * spd * dt, this.radius, WORLD_H - this.radius);

    this.energy = clamp(this.energy + 12 * dt, 0, this.maxEnergy);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.muzzle = Math.max(0, this.muzzle - dt * 8);

    // aim
    this.aim = angleTo(this.x, this.y, g.camera.toWorldX(inp.mouseX), g.camera.toWorldY(inp.mouseY));

    // weapon switching
    if (inp.wasPressed('1')) this.switchWeapon('pulse');
    if (inp.wasPressed('2')) this.switchWeapon('shotgun');
    if (inp.wasPressed('3')) this.switchWeapon('arc');

    // weapon update
    const ws = this.weapons[this.weaponKey];
    const def = ws.def;
    ws.cooldownT = Math.max(0, ws.cooldownT - dt);
    if (ws.reloadT > 0) {
      ws.reloadT -= dt;
      if (ws.reloadT <= 0) { ws.ammo = def.magSize; Sound.reload(); }
    }
    if (def.useHeat) {
      if (!(inp.mouseDown && !ws.overheated)) {
        ws.heat = Math.max(0, ws.heat - def.coolPerSec * dt);
        if (ws.overheated && ws.heat <= def.overheatLock) ws.overheated = false;
      }
    }
    if (inp.wasPressed('r') && !def.useHeat && ws.reloadT <= 0 && ws.ammo < def.magSize) {
      ws.reloadT = def.reloadTime; Sound.reload();
    }
    if (inp.mouseDown && !g.uiBlocksFire) this.fire(dt, ws);

    // shield
    if (this.shield) {
      this.shield.t -= dt;
      if (this.shield.t <= 0 || this.shield.hp <= 0) this.shield = null;
    }
    // device cooldowns
    for (const k in this.dev) this.dev[k] = Math.max(0, this.dev[k] - dt);

    // devices
    if (inp.wasPressed('q') && this.dev.turret <= 0) {
      this.dev.turret = 25 * this.devCdMult;
      g.turrets.push(new Turret(g, this.x + Math.cos(this.aim) * 30, this.y + Math.sin(this.aim) * 30, 25, false));
      Sound.device();
    }
    if (inp.wasPressed('f') && this.dev.shield <= 0) {
      this.dev.shield = 18 * this.devCdMult;
      this.shield = { hp: 80, max: 80, t: 4 };
      Sound.device();
    }
    if (inp.wasPressed('c') && this.dev.scanner <= 0) {
      this.dev.scanner = 12 * this.devCdMult;
      g.scanPulse = { x: this.x, y: this.y, r: 0, max: 620 };
      g.scanRevealT = 5;
      Sound.device();
    }
    if (inp.wasPressed('x') && this.dev.mine <= 0) {
      this.dev.mine = 10 * this.devCdMult;
      g.mines.push(new Mine(g, this.x, this.y));
      Sound.device();
    }

    // resource magnet + auto pickup of light resources
    for (const r of g.resources) {
      if (r.dead || r.weightHeavy()) continue;
      const d = dist(this.x, this.y, r.x, r.y);
      if (d < this.magnetRange + this.radius + 20) {
        const a = angleTo(r.x, r.y, this.x, this.y);
        r.x += Math.cos(a) * 90 * dt;
        r.y += Math.sin(a) * 90 * dt;
      }
      if (d < this.radius + 12) this.tryPickup(r);
    }

    // interaction
    if (inp.wasPressed('e')) this.interact();
  }
  switchWeapon(k) {
    if (this.weaponKey !== k) { this.weaponKey = k; Sound.reload(); }
  }
  fire(dt, ws) {
    const g = this.game, def = ws.def;
    if (def.useHeat) {
      if (ws.overheated) return;
      ws.heat += def.heatPerSec * dt;
      if (ws.heat >= 100) { ws.heat = 100; ws.overheated = true; Sound.hurt(); return; }
      ws.cooldownT -= dt;
      if (ws.cooldownT <= 0) {
        ws.cooldownT = 1 / def.tickRate;
        this.fireArc(def);
      }
      return;
    }
    if (ws.reloadT > 0 || ws.cooldownT > 0) return;
    if (ws.ammo <= 0) { ws.reloadT = def.reloadTime; Sound.reload(); return; }
    ws.cooldownT = 1 / def.fireRate;
    ws.ammo--;
    this.muzzle = 1;
    const dmg = def.damage * this.damageMult(def.key);
    for (let i = 0; i < def.pellets; i++) {
      const a = this.aim + rand(-def.spread, def.spread);
      const ox = this.x + Math.cos(this.aim) * (this.radius + 6);
      const oy = this.y + Math.sin(this.aim) * (this.radius + 6);
      g.projectiles.push(new Projectile(ox, oy, a, def.projSpeed * rand(0.93, 1.07), dmg, def.projRadius, def.color, true, def.key === 'shotgun' ? 320 : 700));
    }
    if (def.key === 'shotgun') { Sound.shotgun(); g.camera.addShake(3); }
    else { Sound.shoot(); g.camera.addShake(0.7); }
  }
  fireArc(def) {
    const g = this.game;
    // find first target: nearest enemy within range, roughly in aim direction
    let first = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > def.range + e.radius) continue;
      const ad = Math.abs(angleDiff(this.aim, angleTo(this.x, this.y, e.x, e.y)));
      if (ad > 0.9) continue;
      if (d < bd) { bd = d; first = e; }
    }
    const chainPts = [{ x: this.x + Math.cos(this.aim) * (this.radius + 4), y: this.y + Math.sin(this.aim) * (this.radius + 4) }];
    if (first) {
      const hitset = new Set();
      let cur = first;
      for (let i = 0; i < def.chain && cur; i++) {
        hitset.add(cur);
        cur.takeDamage(def.damage, this.x, this.y, 'arc');
        chainPts.push({ x: cur.x, y: cur.y });
        let next = null, nd = Infinity;
        for (const e of g.enemies) {
          if (e.dead || hitset.has(e)) continue;
          const d = dist(cur.x, cur.y, e.x, e.y);
          if (d < def.chainRange && d < nd) { nd = d; next = e; }
        }
        cur = next;
      }
    } else {
      chainPts.push({
        x: this.x + Math.cos(this.aim) * def.range,
        y: this.y + Math.sin(this.aim) * def.range
      });
    }
    g.arcBeam = { pts: chainPts, t: 0.07 };
    Sound.arc();
  }
  tryPickup(r) {
    if (r.dead) return false;
    const def = RESOURCE_TYPES[r.type];
    if (this.carryWeight() + def.weight > this.carryCapacity) {
      this.game.toast('Перегруз! Сдай ресурсы (вес ' + this.carryWeight() + '/' + this.carryCapacity + ')');
      return false;
    }
    r.dead = true;
    this.carry.push(r.type);
    Sound.pickup();
    burst(this.game, r.x, r.y, def.color, 6, 80, 3, 0.5);
    return true;
  }
  interact() {
    const g = this.game;
    // 1) deliver at cargo pad
    if (g.outpost.nearPad(this.x, this.y) && this.carry.length > 0) {
      g.outpost.deliverFromPlayer(this);
      return;
    }
    // 2) heavy resource -> mule
    let best = null, bd = Infinity;
    for (const r of g.resources) {
      if (r.dead) continue;
      const d = dist(this.x, this.y, r.x, r.y);
      if (d < 60 && d < bd) { bd = d; best = r; }
    }
    if (best) {
      if (best.weightHeavy()) {
        if (g.mule && !g.mule.dead && dist(this.x, this.y, g.mule.x, g.mule.y) < 140) {
          if (g.mule.loadCargo(best.type)) {
            best.dead = true;
            Sound.pickup();
            burst(g, best.x, best.y, RESOURCE_TYPES[best.type].color, 8, 90, 3, 0.5);
            g.toast(RESOURCE_TYPES[best.type].name + ' загружен в Mule-3');
          } else g.toast('Грузовые слоты Mule-3 заполнены');
        } else g.toast('Тяжёлый ресурс: подведи Mule-3 ближе');
        return;
      } else { this.tryPickup(best); return; }
    }
    // 3) activate reactor
    if (g.outpost.nearReactor(this.x, this.y) && !g.outpost.active) {
      g.outpost.activate();
      return;
    }
  }
  takeDamage(dmg, fx, fy) {
    if (this.invuln > 0 || this.dead) return;
    if (this.shield) {
      const abs = Math.min(this.shield.hp, dmg);
      this.shield.hp -= abs;
      dmg -= abs;
      if (dmg <= 0) { Sound.hit(); return; }
    }
    dmg *= (1 - this.armor / (this.armor + 100));
    this.health -= dmg;
    this.hitFlash = 1;
    this.invuln = 0.15;
    this.game.camera.addShake(4);
    Sound.hurt();
    burst(this.game, this.x, this.y, '#ff6a6a', 8, 110, 3, 0.5);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      burst(this.game, this.x, this.y, '#7af5ff', 30, 200, 5, 1.2);
      Sound.explosion();
      this.game.onPlayerDeath();
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    // glow
    ctx.fillStyle = 'rgba(120,240,255,0.10)';
    ctx.beginPath(); ctx.arc(x, y, this.radius + 14, 0, TAU); ctx.fill();
    // body
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.aim);
    // armored capsule
    ctx.fillStyle = this.hitFlash > 0 ? '#ff9d9d' : '#9fb6c4';
    ctx.strokeStyle = '#dff6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius, this.radius * 0.78, 0, 0, TAU);
    ctx.fill(); ctx.stroke();
    // visor / facing
    ctx.fillStyle = '#1ee2ff';
    ctx.beginPath();
    ctx.moveTo(this.radius + 2, 0);
    ctx.lineTo(this.radius - 7, -5);
    ctx.lineTo(this.radius - 7, 5);
    ctx.closePath(); ctx.fill();
    // weapon barrel
    ctx.strokeStyle = '#5a6f7d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 0); ctx.lineTo(this.radius + 9, 0);
    ctx.stroke();
    if (this.muzzle > 0) {
      ctx.fillStyle = 'rgba(255,255,200,' + (this.muzzle * 0.8) + ')';
      ctx.beginPath(); ctx.arc(this.radius + 10, 0, 5 * this.muzzle, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // shield
    if (this.shield) {
      const a = 0.25 + 0.35 * (this.shield.hp / this.shield.max);
      ctx.strokeStyle = 'rgba(110,200,255,' + a + ')';
      ctx.fillStyle = 'rgba(110,200,255,' + (a * 0.25) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, this.radius + 16, 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    // carried resources orbit
    const t = performance.now() / 600;
    this.carry.forEach((k, i) => {
      const a = t + i * (TAU / Math.max(4, this.carry.length));
      const rx = x + Math.cos(a) * (this.radius + 9);
      const ry = y + Math.sin(a) * (this.radius + 9);
      ctx.fillStyle = RESOURCE_TYPES[k].color;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 4); ctx.lineTo(rx + 3, ry); ctx.lineTo(rx, ry + 4); ctx.lineTo(rx - 3, ry);
      ctx.closePath(); ctx.fill();
    });
  }
}

/* =============================== ENEMY ================================== */
class Enemy {
  constructor(game, type, x, y, level) {
    this.game = game;
    this.typeKey = type;
    const t = ENEMY_TYPES[type];
    this.def = t;
    const lvlMult = 1 + 0.18 * ((level || 1) - 1);
    this.maxHp = t.hp * lvlMult;
    this.hp = this.maxHp;
    this.speed = t.speed * (1 + 0.06 * ((level || 1) - 1));
    this.damage = t.damage * lvlMult;
    this.x = x; this.y = y;
    this.radius = t.radius;
    this.attackT = rand(0, t.attackCd);
    this.dead = false;
    this.facing = rand(0, TAU);
    this.hitFlash = 0;
    this.shielded = false;     // warden aura
    this.chargeT = rand(2, 4); // bull
    this.charging = 0;
    this.wobble = rand(0, TAU);
    this.target = null;        // 'player' | 'mule' | 'outpost'
    this.homeX = x; this.homeY = y;
    this.aggro = false;
    this.wanderA = rand(0, TAU);
    this.wanderT = rand(0.5, 2);
  }
  pickTarget() {
    const g = this.game, p = g.player;
    let tx = p.x, ty = p.y, tt = 'player';
    if (g.threatLevel() >= 4) {
      // prefer mule / outpost sometimes
      if (g.mule && !g.mule.dead) {
        const dm = dist(this.x, this.y, g.mule.x, g.mule.y);
        const dp = dist(this.x, this.y, p.x, p.y);
        if (dm < dp * 0.9 && Math.random() < 0.6) { tx = g.mule.x; ty = g.mule.y; tt = 'mule'; }
      }
      if (tt === 'player' && g.outpost.active && Math.random() < 0.12) {
        tx = g.outpost.x; ty = g.outpost.y; tt = 'outpost';
      }
    } else if (this.typeKey === 'carapaceBull' && g.mule && !g.mule.dead && Math.random() < 0.25) {
      const dm = dist(this.x, this.y, g.mule.x, g.mule.y);
      if (dm < 420) { tx = g.mule.x; ty = g.mule.y; tt = 'mule'; }
    }
    this.target = { x: tx, y: ty, type: tt };
  }
  targetEntity() {
    const g = this.game;
    if (!this.target) return null;
    if (this.target.type === 'mule') return g.mule;
    if (this.target.type === 'outpost') return g.outpost;
    return g.player;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.attackT -= dt;
    this.wobble += dt * 6;
    // Aggro / leash: idle enemies guard their spawn area until the player
    // (or mule) comes close, they take damage, or global threat is high.
    if (!this.aggro) {
      const dp = dist(this.x, this.y, p.x, p.y);
      const dm = (g.mule && !g.mule.dead) ? dist(this.x, this.y, g.mule.x, g.mule.y) : Infinity;
      if (dp < 460 || dm < 360 || g.threatLevel() >= 3) {
        this.aggro = true;
      } else {
        // lazy wander around home point
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(1.2, 3);
          const dh = dist(this.x, this.y, this.homeX, this.homeY);
          this.wanderA = dh > 160
            ? angleTo(this.x, this.y, this.homeX, this.homeY)
            : rand(0, TAU);
        }
        this.facing = this.wanderA;
        this.x += Math.cos(this.wanderA) * this.speed * 0.35 * dt;
        this.y += Math.sin(this.wanderA) * this.speed * 0.35 * dt;
        this.x = clamp(this.x, 20, WORLD_W - 20);
        this.y = clamp(this.y, 20, WORLD_H - 20);
        return;
      }
    }
    if (!this.target || Math.random() < dt * 0.5) this.pickTarget();
    // live target coords
    const te = this.targetEntity();
    if (te && !te.dead) { this.target.x = te.x; this.target.y = te.y; }
    const tx = this.target.x, ty = this.target.y;
    const d = dist(this.x, this.y, tx, ty);
    const aimA = angleTo(this.x, this.y, tx, ty);
    this.facing = aimA;

    switch (this.def.kind) {
      case 'melee': {
        // swarm: slight orbit offset
        const orbit = Math.sin(this.wobble) * 0.5;
        const a = aimA + (d < 120 ? orbit : 0);
        if (d > this.def.range + (te ? te.radius || 14 : 14)) {
          this.x += Math.cos(a) * this.speed * dt;
          this.y += Math.sin(a) * this.speed * dt;
        } else this.tryMelee(te);
        break;
      }
      case 'ranged': {
        const ideal = 210;
        if (d > ideal + 40) {
          this.x += Math.cos(aimA) * this.speed * dt;
          this.y += Math.sin(aimA) * this.speed * dt;
        } else if (d < 140) {
          this.x -= Math.cos(aimA) * this.speed * 1.1 * dt;
          this.y -= Math.sin(aimA) * this.speed * 1.1 * dt;
        } else {
          // strafe
          this.x += Math.cos(aimA + Math.PI / 2) * Math.sin(this.wobble * 0.7) * this.speed * 0.5 * dt;
          this.y += Math.sin(aimA + Math.PI / 2) * Math.sin(this.wobble * 0.7) * this.speed * 0.5 * dt;
        }
        if (d < this.def.range && this.attackT <= 0) {
          this.attackT = this.def.attackCd;
          g.enemyProjectiles.push(new Projectile(this.x, this.y, aimA + rand(-0.06, 0.06), 300, this.damage, 4, '#8aff5d', false, 420));
          Sound.blip(260, 0.08, 'sawtooth', 0.15, -100);
        }
        break;
      }
      case 'charger': {
        this.chargeT -= dt;
        if (this.charging > 0) {
          this.charging -= dt;
          this.x += Math.cos(this.facing) * this.speed * 3.4 * dt;
          this.y += Math.sin(this.facing) * this.speed * 3.4 * dt;
          if (d < this.radius + 18) { this.tryMelee(te, 1.4); this.charging = 0; }
        } else {
          if (this.chargeT <= 0 && d < 320 && d > 80) {
            this.charging = 0.7;
            this.chargeT = rand(3.5, 5);
            Sound.blip(120, 0.25, 'sawtooth', 0.3, 60);
          } else if (d > this.def.range + 14) {
            this.x += Math.cos(aimA) * this.speed * dt;
            this.y += Math.sin(aimA) * this.speed * dt;
          } else this.tryMelee(te);
        }
        break;
      }
      case 'warden': {
        if (d > this.def.range + 14) {
          this.x += Math.cos(aimA) * this.speed * dt;
          this.y += Math.sin(aimA) * this.speed * dt;
        } else this.tryMelee(te);
        // shield aura for small allies
        for (const e of g.enemies) {
          if (e === this || e.dead) continue;
          if (e.typeKey === 'skitterling' || e.typeKey === 'sporeMantis') {
            if (dist2(this.x, this.y, e.x, e.y) < 150 * 150) e.shielded = true;
          }
        }
        break;
      }
    }
    this.x = clamp(this.x, this.radius, WORLD_W - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_H - this.radius);
    // separation from other enemies (cheap)
    if (Math.random() < 0.4) {
      for (const e of g.enemies) {
        if (e === this || e.dead) continue;
        const dd = dist(this.x, this.y, e.x, e.y);
        const min = this.radius + e.radius - 2;
        if (dd < min && dd > 0.01) {
          const a = angleTo(e.x, e.y, this.x, this.y);
          this.x += Math.cos(a) * (min - dd) * 0.5;
          this.y += Math.sin(a) * (min - dd) * 0.5;
        }
      }
    }
  }
  tryMelee(te, mult) {
    if (this.attackT > 0 || !te || te.dead) return;
    this.attackT = this.def.attackCd;
    const dmg = this.damage * (mult || 1);
    if (te === this.game.player) te.takeDamage(dmg, this.x, this.y);
    else if (te.takeDamage) te.takeDamage(dmg);
    burst(this.game, te.x, te.y, '#ffd35d', 5, 90, 3, 0.35);
  }
  takeDamage(dmg, fromX, fromY, src) {
    if (this.dead) return;
    if (this.shielded) dmg *= 0.7;
    if (this.def.armor) {
      // frontal armor: shots arriving against facing reduced
      if (fromX !== undefined) {
        const hitA = angleTo(this.x, this.y, fromX, fromY);
        const ad = Math.abs(angleDiff(this.facing, hitA));
        if (ad < 1.0) dmg *= (1 - this.def.armor);
        else dmg *= (1 - this.def.armor * 0.4);
      } else dmg *= (1 - this.def.armor * 0.5);
    }
    this.hp -= dmg;
    this.aggro = true;
    this.hitFlash = 1;
    Sound.hit();
    burst(this.game, this.x, this.y, this.def.color, 3, 70, 2.5, 0.3);
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    g.run.kills++;
    g.run.score += this.def.score;
    Sound.enemyDie();
    burst(g, this.x, this.y, this.def.color, 14, 150, 4, 0.7);
    // small loot chance
    if (Math.random() < 0.10) {
      g.resources.push(new ResourceNode(g, this.x + rand(-8, 8), this.y + rand(-8, 8),
        Math.random() < 0.6 ? 'bioResin' : 'salvageChips'));
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    const flash = this.hitFlash > 0;
    ctx.save();
    ctx.translate(x, y);
    const col = flash ? '#ffffff' : this.def.color;
    switch (this.typeKey) {
      case 'skitterling': {
        // legs
        ctx.strokeStyle = 'rgba(255,93,77,0.7)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const a = this.facing + Math.PI / 2 + (i - 2.5) * 0.5 + Math.sin(this.wobble + i) * 0.25;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * (this.radius + 5), Math.sin(a) * (this.radius + 5));
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a + Math.PI) * (this.radius + 5), Math.sin(a + Math.PI) * (this.radius + 5));
          ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a0a06';
        ctx.beginPath(); ctx.arc(Math.cos(this.facing) * 4, Math.sin(this.facing) * 4, this.radius * 0.45, 0, TAU); ctx.fill();
        break;
      }
      case 'sporeMantis': {
        ctx.rotate(this.facing);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(this.radius + 4, 0);
        ctx.lineTo(-this.radius, -this.radius);
        ctx.lineTo(-this.radius * 0.4, 0);
        ctx.lineTo(-this.radius, this.radius);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e7c4ff';
        ctx.beginPath(); ctx.arc(this.radius * 0.3, 0, 3.5, 0, TAU); ctx.fill();
        break;
      }
      case 'carapaceBull': {
        ctx.rotate(this.facing);
        if (this.charging > 0) {
          ctx.strokeStyle = 'rgba(255,154,61,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, this.radius + 6, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius + 3, this.radius * 0.8, 0, 0, TAU);
        ctx.fill();
        // frontal plate
        ctx.fillStyle = flash ? '#fff' : '#c96a1a';
        ctx.beginPath();
        ctx.ellipse(this.radius * 0.45, 0, this.radius * 0.6, this.radius * 0.75, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#5a2c08';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.1, -this.radius * 0.7);
        ctx.lineTo(this.radius * 0.1, this.radius * 0.7);
        ctx.stroke();
        break;
      }
      case 'broodWarden': {
        // aura
        ctx.strokeStyle = 'rgba(255,80,120,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 150 * 0.35 + Math.sin(this.wobble) * 4, 0, TAU); ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, TAU); ctx.fill();
        ctx.strokeStyle = flash ? '#fff' : '#ff7da0';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, this.radius + 4 + Math.sin(this.wobble * 2) * 2, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#3d0716';
        for (let i = 0; i < 5; i++) {
          const a = this.facing + i * (TAU / 5);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * this.radius * 0.55, Math.sin(a) * this.radius * 0.55, 3.5, 0, TAU);
          ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
    if (flash) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(x, y, this.radius + 2, 0, TAU); ctx.fill();
    }
    // hp bar when damaged
    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - w / 2, y - this.radius - 9, w, 4);
      ctx.fillStyle = this.shielded ? '#ff7da0' : '#ff5d4d';
      ctx.fillRect(x - w / 2, y - this.radius - 9, w * clamp(this.hp / this.maxHp, 0, 1), 4);
    }
  }
}

/* ================================ HIVE ================================== */
class Hive {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.level = 1;
    this.maxLevel = 3;
    this.maxHp = 500;
    this.hp = this.maxHp;
    this.radius = 42;
    this.spawnT = rand(2, 5);
    this.growthT = 90;
    this.influence = 280;
    this.weakAngle = rand(0, TAU);
    this.weakDrift = rand(-0.3, 0.3);
    this.destroyed = false;
    this.pulse = rand(0, TAU);
    this.hitFlash = 0;
  }
  spawnInterval() { return Math.max(3, 9 - this.level * 2 - this.game.threatLevel() * 0.4); }
  update(dt) {
    if (this.destroyed) return;
    const g = this.game;
    this.pulse += dt * (1 + this.level * 0.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.weakAngle += this.weakDrift * dt;
    // growth
    this.growthT -= dt;
    if (this.growthT <= 0 && this.level < this.maxLevel) {
      this.level++;
      this.growthT = 90;
      this.maxHp += 150;
      this.hp += 150;
      this.radius += 7;
      g.toast('Улей вырос до уровня ' + this.level + '!');
      Sound.alarm();
    }
    // spawn
    this.spawnT -= dt;
    const distP = dist(this.x, this.y, g.player.x, g.player.y);
    if (this.spawnT <= 0 && g.enemies.length < 70 && distP < 1400) {
      this.spawnT = this.spawnInterval();
      const pool = ['skitterling'];
      if (this.level >= 2) pool.push('skitterling', 'sporeMantis');
      if (this.level >= 3) pool.push('sporeMantis', 'broodWarden');
      const n = this.level >= 2 ? randInt(1, 2) : 1;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sx = this.x + Math.cos(a) * (this.radius + 20);
        const sy = this.y + Math.sin(a) * (this.radius + 20);
        if (dist(sx, sy, g.player.x, g.player.y) > 180)
          g.enemies.push(new Enemy(g, pick(pool), sx, sy, this.level));
      }
    }
    // signal pressure handled in Game
  }
  takeDamage(dmg, fromX, fromY) {
    if (this.destroyed) return;
    // weak point: hits arriving near weakAngle deal double
    if (fromX !== undefined) {
      const hitA = angleTo(this.x, this.y, fromX, fromY);
      if (Math.abs(angleDiff(this.weakAngle, hitA)) < 0.55) {
        dmg *= 2;
        burst(this.game, this.x + Math.cos(this.weakAngle) * this.radius, this.y + Math.sin(this.weakAngle) * this.radius, '#ffe27a', 5, 100, 3, 0.4);
      }
    }
    this.hp -= dmg;
    this.hitFlash = 1;
    Sound.hit();
    if (this.hp <= 0) this.destroy();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const g = this.game;
    g.run.hivesDestroyed++;
    if (this.level >= 3) g.run.maxHiveLevelKilled = 3;
    else g.run.maxHiveLevelKilled = Math.max(g.run.maxHiveLevelKilled, this.level);
    g.addThreat(0.5);
    Sound.hiveDie();
    g.camera.addShake(9);
    burst(g, this.x, this.y, '#ff5d8a', 40, 240, 6, 1.4);
    burst(g, this.x, this.y, '#8aff5d', 20, 160, 4, 1.0);
    // drop enzymes + extras
    const n = 2 + this.level;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(20, 70);
      g.resources.push(new ResourceNode(g, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 'hiveEnzymes'));
    }
    g.toast('Улей уничтожен! +' + n + ' Hive Enzymes');
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    if (this.destroyed) {
      ctx.fillStyle = 'rgba(70,40,50,0.6)';
      ctx.beginPath(); ctx.arc(x, y, this.radius * 0.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,80,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.radius * 0.5, 0, TAU); ctx.stroke();
      return;
    }
    const p = Math.sin(this.pulse) * 0.5 + 0.5;
    // influence ring (faint)
    ctx.strokeStyle = 'rgba(255,93,138,0.07)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, this.influence, 0, TAU); ctx.stroke();
    // tentacles
    ctx.strokeStyle = 'rgba(190,60,100,0.8)';
    ctx.lineWidth = 5;
    const nt = 6 + this.level * 2;
    for (let i = 0; i < nt; i++) {
      const a = i * (TAU / nt) + Math.sin(this.pulse * 0.6 + i) * 0.18;
      const len = this.radius + 16 + Math.sin(this.pulse + i * 1.7) * 7;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * this.radius * 0.7, y + Math.sin(a) * this.radius * 0.7);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.2) * len * 0.8, y + Math.sin(a + 0.2) * len * 0.8,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    // body
    const grad = ctx.createRadialGradient(x, y, 4, x, y, this.radius + p * 6);
    grad.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#ff7da0');
    grad.addColorStop(0.55, '#a4244f');
    grad.addColorStop(1, '#56132e');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, this.radius + p * 4, 0, TAU); ctx.fill();
    // pores
    ctx.fillStyle = 'rgba(255,170,200,' + (0.4 + p * 0.4) + ')';
    for (let i = 0; i < 3 + this.level; i++) {
      const a = i * 2.1 + this.pulse * 0.3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * this.radius * 0.5, y + Math.sin(a) * this.radius * 0.5, 4 + p * 2, 0, TAU);
      ctx.fill();
    }
    // weak point
    const wx = x + Math.cos(this.weakAngle) * this.radius;
    const wy = y + Math.sin(this.weakAngle) * this.radius;
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath(); ctx.arc(wx, wy, 6 + p * 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,122,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wx, wy, 10 + p * 3, 0, TAU); ctx.stroke();
    // level + hp
    ctx.fillStyle = '#ffd9e6';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HIVE L' + this.level, x, y - this.radius - 16);
    const w = this.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y - this.radius - 12, w, 5);
    ctx.fillStyle = '#ff5d8a';
    ctx.fillRect(x - w / 2, y - this.radius - 12, w * clamp(this.hp / this.maxHp, 0, 1), 5);
    ctx.textAlign = 'left';
  }
}

/* ============================ RESOURCE NODE ============================= */
class ResourceNode {
  constructor(game, x, y, type) {
    this.game = game;
    this.x = x; this.y = y;
    this.type = type;
    this.dead = false;
    this.bob = rand(0, TAU);
    this.radius = 9 + RESOURCE_TYPES[type].weight;
  }
  weightHeavy() { return RESOURCE_TYPES[this.type].weight >= 3; }
  update(dt) { this.bob += dt * 2.4; }
  draw(ctx, cam, revealed) {
    const def = RESOURCE_TYPES[this.type];
    const x = cam.wx(this.x), y = cam.wy(this.y) + Math.sin(this.bob) * 2;
    const p = Math.sin(this.bob) * 0.5 + 0.5;
    ctx.fillStyle = def.glow + (0.10 + p * 0.10) + ')';
    ctx.beginPath(); ctx.arc(x, y, this.radius + 9, 0, TAU); ctx.fill();
    // crystal diamond
    ctx.fillStyle = def.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    const r = this.radius;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    if (this.weightHeavy()) {
      ctx.fillStyle = '#cfe9ff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY', x, y + r + 11);
      ctx.textAlign = 'left';
    }
    if (revealed) {
      ctx.strokeStyle = def.glow + '0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, this.radius + 13 + p * 3, 0, TAU); ctx.stroke();
    }
  }
}

/* ================================ MULE ================================== */
class Mule {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 22;
    this.maxHp = 300 + 100 * game.meta.upgrades.muleArmor;
    this.hp = this.maxHp;
    this.cargoSlots = 4;
    this.cargo = []; // resource type keys
    this.dead = false;
    this.facing = 0;
    this.hitFlash = 0;
    this.trackAnim = 0;
  }
  loadCargo(type) {
    if (this.cargo.length >= this.cargoSlots) return false;
    this.cargo.push(type);
    return true;
  }
  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 1;
    burst(this.game, this.x, this.y, '#ffd35d', 6, 100, 3, 0.4);
    if (this.hp <= 0) {
      this.dead = true;
      this.game.run.muleLost = true;
      Sound.explosion();
      this.game.camera.addShake(10);
      burst(this.game, this.x, this.y, '#ff9a3d', 30, 220, 6, 1.2);
      // drop cargo
      for (const c of this.cargo) {
        const a = rand(0, TAU), d = rand(10, 50);
        this.game.resources.push(new ResourceNode(this.game, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, c));
      }
      this.cargo = [];
      this.game.toast('Mule-3 уничтожен! Груз рассыпан.');
    }
  }
  update(dt) {
    if (this.dead) return;
    const g = this.game, p = g.player;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    const d = dist(this.x, this.y, p.x, p.y);
    if (d > 110) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      const spd = clamp((d - 100) * 1.6, 40, 240);
      this.x += Math.cos(a) * spd * dt;
      this.y += Math.sin(a) * spd * dt;
      this.facing = lerp(this.facing, a, clamp(dt * 4, 0, 1));
      this.trackAnim += spd * dt * 0.05;
    }
    this.x = clamp(this.x, this.radius, WORLD_W - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_H - this.radius);
    // auto unload at cargo pad
    if (this.cargo.length > 0 && g.outpost.nearPad(this.x, this.y, 90)) {
      g.outpost.deliverFromMule(this);
    }
    // repair zone
    if (g.outpost.active && g.outpost.nearRepair(this.x, this.y) && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 18 * dt);
      if (Math.random() < dt * 6) burst(g, this.x + rand(-15, 15), this.y + rand(-15, 15), '#5dffc8', 1, 30, 2, 0.4);
    }
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const x = cam.wx(this.x), y = cam.wy(this.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.facing);
    // tracks
    ctx.fillStyle = '#2a3640';
    ctx.fillRect(-24, -20, 48, 7);
    ctx.fillRect(-24, 13, 48, 7);
    ctx.fillStyle = '#16202a';
    for (let i = 0; i < 5; i++) {
      const off = ((this.trackAnim + i * 10) % 48) - 24;
      ctx.fillRect(off, -20, 4, 7);
      ctx.fillRect(off, 13, 4, 7);
    }
    // hull
    ctx.fillStyle = this.hitFlash > 0 ? '#ffd9a0' : '#7a8b99';
    ctx.strokeStyle = '#cfe2ee';
    ctx.lineWidth = 2;
    ctx.fillRect(-22, -14, 44, 28);
    ctx.strokeRect(-22, -14, 44, 28);
    // cab light
    ctx.fillStyle = '#2ee6a8';
    ctx.fillRect(14, -5, 6, 10);
    // cargo cells
    for (let i = 0; i < this.cargoSlots; i++) {
      const cx = -16 + (i % 2) * 14, cy = -8 + Math.floor(i / 2) * 14;
      ctx.strokeStyle = '#3c4c5a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cy, 11, 11);
      if (i < this.cargo.length) {
        ctx.fillStyle = RESOURCE_TYPES[this.cargo[i]].color;
        ctx.fillRect(cx + 2, cy + 2, 7, 7);
      }
    }
    ctx.restore();
    // label + hp
    ctx.fillStyle = '#bfe6cf';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MULE-3', x, y - this.radius - 12);
    const w = 44;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y - this.radius - 9, w, 4);
    ctx.fillStyle = '#5dffc8';
    ctx.fillRect(x - w / 2, y - this.radius - 9, w * clamp(this.hp / this.maxHp, 0, 1), 4);
    ctx.textAlign = 'left';
  }
}

/* =============================== OUTPOST ================================ */
class Outpost {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 90;
    this.active = false;
    this.state = 'inactive'; // inactive | active | under_attack
    this.attackT = 0;
    this.pad = { x: x + 70, y: y + 30, r: 46 };
    this.reactor = { x: x - 50, y: y - 30, r: 30 };
    this.repair = { x: x - 30, y: y + 70, r: 44 };
    this.turretSpot = { x: x + 50, y: y - 60 };
    this.turret = null;
    this.spin = 0;
  }
  nearPad(x, y, extra) { return dist(x, y, this.pad.x, this.pad.y) < this.pad.r + (extra || 30); }
  nearReactor(x, y) { return dist(x, y, this.reactor.x, this.reactor.y) < this.reactor.r + 35; }
  nearRepair(x, y) { return dist(x, y, this.repair.x, this.repair.y) < this.repair.r + 20; }
  activate() {
    const g = this.game;
    this.active = true;
    this.state = 'active';
    g.addThreat(1);
    g.run.reactorActivated = true;
    g.run.reactorTimer = 0;
    this.turret = new Turret(g, this.turretSpot.x, this.turretSpot.y, Infinity, true);
    g.turrets.push(this.turret);
    g.toast('Реактор активирован. Аванпост Pale Harbor-Δ работает. Угроза растёт!');
    Sound.alarm();
  }
  deliverFromPlayer(player) {
    const g = this.game;
    if (player.carry.length === 0) return;
    let val = 0;
    for (const k of player.carry) {
      val += g.sellPrice(k);
      g.run.delivered[k] = (g.run.delivered[k] || 0) + 1;
    }
    g.run.deliveredValue += val;
    g.toast('Сдано ресурсов на ' + val + ' cr');
    player.carry = [];
    Sound.deliver();
    burst(g, this.pad.x, this.pad.y, '#5dffc8', 14, 120, 4, 0.7);
  }
  deliverFromMule(mule) {
    const g = this.game;
    if (mule.cargo.length === 0) return;
    let val = 0;
    for (const k of mule.cargo) {
      val += g.sellPrice(k);
      g.run.delivered[k] = (g.run.delivered[k] || 0) + 1;
    }
    g.run.deliveredValue += val;
    g.toast('Mule-3 сдал груз на ' + val + ' cr');
    mule.cargo = [];
    Sound.deliver();
    burst(g, this.pad.x, this.pad.y, '#5dffc8', 14, 120, 4, 0.7);
  }
  takeDamage(dmg) {
    this.attackT = 2;
    if (this.active) this.state = 'under_attack';
    // outpost itself indestructible in prototype, but flashes
    burst(this.game, this.x + rand(-40, 40), this.y + rand(-40, 40), '#ffd35d', 4, 80, 3, 0.4);
  }
  get dead() { return false; }
  update(dt) {
    this.spin += dt * (this.active ? 2 : 0.3);
    this.attackT = Math.max(0, this.attackT - dt);
    if (this.active && this.attackT <= 0) this.state = 'active';
    // signal regen near outpost handled in Game
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    // base plate
    ctx.fillStyle = '#18242c';
    ctx.strokeStyle = this.state === 'under_attack' ? '#ff5d4d' : (this.active ? '#2ee6a8' : '#3c4c5a');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + Math.PI / 6;
      const px = x + Math.cos(a) * this.radius, py = y + Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfe2ee';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OUTPOST PALE HARBOR-Δ', x, y - this.radius - 10);
    ctx.textAlign = 'left';

    // cargo pad
    const pad = this.pad;
    const pp = Math.sin(this.spin * 1.5) * 0.5 + 0.5;
    ctx.fillStyle = 'rgba(46,230,168,' + (0.12 + pp * 0.10) + ')';
    ctx.strokeStyle = '#2ee6a8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cam.wx(pad.x), cam.wy(pad.y), pad.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(46,230,168,0.5)';
    ctx.beginPath(); ctx.arc(cam.wx(pad.x), cam.wy(pad.y), pad.r * 0.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#aef5dc';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CARGO PAD [E]', cam.wx(pad.x), cam.wy(pad.y) + 4);

    // reactor
    const rc = this.reactor;
    const rx = cam.wx(rc.x), ry = cam.wy(rc.y);
    ctx.fillStyle = '#22303a';
    ctx.strokeStyle = this.active ? '#7af5ff' : '#5a6f7d';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rx, ry, rc.r, 0, TAU); ctx.fill(); ctx.stroke();
    if (this.active) {
      ctx.strokeStyle = 'rgba(122,245,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(rx, ry, rc.r * 0.6, this.spin, this.spin + Math.PI * 1.2); ctx.stroke();
      ctx.fillStyle = '#7af5ff';
      ctx.beginPath(); ctx.arc(rx, ry, 6 + pp * 3, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#5a6f7d';
      ctx.beginPath(); ctx.arc(rx, ry, 7, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#cfe9ff';
    ctx.fillText(this.active ? 'REACTOR ONLINE' : 'REACTOR OFFLINE [E]', rx, ry - rc.r - 8);

    // repair zone
    const rp = this.repair;
    ctx.strokeStyle = 'rgba(93,255,200,0.55)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cam.wx(rp.x), cam.wy(rp.y), rp.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fe9cf';
    ctx.fillText('REPAIR', cam.wx(rp.x), cam.wy(rp.y) + 3);
    ctx.textAlign = 'left';
  }
}

/* =============================== TURRET ================================= */
class Turret {
  constructor(game, x, y, lifetime, permanent) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 12;
    this.life = lifetime;
    this.permanent = permanent;
    this.fireT = 0;
    this.aim = 0;
    this.range = 220;
    this.damage = 8;
    this.dead = false;
  }
  update(dt) {
    if (!this.permanent) {
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        burst(this.game, this.x, this.y, '#7af5ff', 8, 90, 3, 0.5);
        return;
      }
    }
    this.fireT -= dt;
    let target = null, bd = Infinity;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < this.range && d < bd) { bd = d; target = e; }
    }
    if (target) {
      this.aim = angleTo(this.x, this.y, target.x, target.y);
      if (this.fireT <= 0) {
        this.fireT = 0.4;
        this.game.projectiles.push(new Projectile(
          this.x + Math.cos(this.aim) * 14, this.y + Math.sin(this.aim) * 14,
          this.aim + rand(-0.05, 0.05), 600, this.damage, 2.5,
          this.permanent ? '#2ee6a8' : '#7af5ff', true, 260));
        Sound.blip(620, 0.05, 'square', 0.12, -300);
      }
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    ctx.fillStyle = this.permanent ? '#1c3a32' : '#1c2e3a';
    ctx.strokeStyle = this.permanent ? '#2ee6a8' : '#7af5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 13); ctx.lineTo(x + 12, y + 9); ctx.lineTo(x - 12, y + 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#cfe9ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + Math.cos(this.aim) * 16, y - 2 + Math.sin(this.aim) * 16);
    ctx.stroke();
    if (!this.permanent) {
      ctx.fillStyle = 'rgba(122,245,255,0.8)';
      ctx.fillRect(x - 12, y + 13, 24 * clamp(this.life / 25, 0, 1), 3);
    }
  }
}

/* ================================ MINE ================================== */
class Mine {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 7;
    this.armT = 0.6;
    this.blink = 0;
    this.dead = false;
  }
  update(dt) {
    this.armT -= dt;
    this.blink += dt * 6;
    if (this.armT > 0) return;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      if (dist2(this.x, this.y, e.x, e.y) < (30 + e.radius) * (30 + e.radius)) {
        this.explode();
        return;
      }
    }
  }
  explode() {
    this.dead = true;
    const g = this.game;
    Sound.explosion();
    g.camera.addShake(6);
    burst(g, this.x, this.y, '#ffd35d', 24, 240, 5, 0.8);
    burst(g, this.x, this.y, '#ff7a3d', 14, 160, 4, 0.6);
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (dist(this.x, this.y, e.x, e.y) < 80 + e.radius) e.takeDamage(90, this.x, this.y);
    }
    for (const h of g.hives) {
      if (!h.destroyed && dist(this.x, this.y, h.x, h.y) < 80 + h.radius) h.takeDamage(90, this.x, this.y);
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x), y = cam.wy(this.y);
    ctx.fillStyle = '#2a3640';
    ctx.strokeStyle = '#5a6f7d';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, this.radius, 0, TAU); ctx.fill(); ctx.stroke();
    const on = Math.sin(this.blink) > 0;
    ctx.fillStyle = on ? '#ff5d4d' : '#5a2020';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
  }
}

/* =============================== MISSION ================================ */
class Mission {
  constructor(game, key) {
    this.game = game;
    this.key = key;
    this.def = MISSIONS[key];
    this.complete = false;
    this.bonus = false;
  }
  update(dt) {
    const g = this.game, r = g.run;
    switch (this.key) {
      case 'resourceRun':
        this.complete = r.deliveredValue >= 120;
        this.bonus = r.deliveredValue >= 200;
        break;
      case 'hivePurge':
        this.complete = r.hivesDestroyed >= 2;
        this.bonus = r.maxHiveLevelKilled >= 3;
        break;
      case 'outpostRecovery':
        if (r.reactorActivated) r.reactorTimer += dt;
        this.complete = r.reactorActivated && r.deliveredValue >= 60 && r.reactorTimer >= 90;
        this.bonus = this.complete && !r.muleLost;
        break;
    }
  }
  objectiveText() {
    const g = this.game, r = g.run;
    switch (this.key) {
      case 'resourceRun':
        return 'Доставить: ' + Math.min(120, r.deliveredValue) + ' / 120 cr';
      case 'hivePurge':
        return 'Ульи: ' + Math.min(2, r.hivesDestroyed) + ' / 2 уничтожено';
      case 'outpostRecovery': {
        if (!r.reactorActivated) return 'Активируй реактор аванпоста [E]';
        const parts = [];
        parts.push('Груз: ' + Math.min(60, r.deliveredValue) + '/60 cr');
        parts.push('Удержание: ' + Math.min(90, Math.floor(r.reactorTimer)) + '/90 с');
        return parts.join('  •  ');
      }
    }
    return '';
  }
}

/* ================================ GAME ================================== */
const SAVE_KEY = 'exoswarm_salvage_save_v1';

function defaultMeta() {
  return {
    credits: 0,
    resources: { bioResin: 0, sporeFiber: 0, salvageChips: 0, softQuartz: 0, hiveEnzymes: 0 },
    upgrades: { cloneHealth: 0, rifleDamage: 0, cargoHarness: 0, muleArmor: 0, deviceCooling: 0, marketContacts: 0, signalArray: 0, hydroponicsTray: 0 },
    unlockedWeapons: ['pulse', 'shotgun', 'arc'],
    runCount: 0,
    bestScore: 0,
    totalKills: 0,
    totalHives: 0,
    priceMods: { bioResin: 1, sporeFiber: 1, salvageChips: 1, softQuartz: 1, hiveEnzymes: 1 }
  };
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera();
    this.state = 'station'; // station | playing | paused | death | victory
    this.meta = defaultMeta();
    this.load();
    this.toasts = [];
    this.uiButtons = [];
    this.uiBlocksFire = false;
    this.showMinimap = true;
    this.showStats = false;
    this.lastTime = performance.now();
    this.deco = [];
    this.endSummary = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(canvas);
    requestAnimationFrame(t => this.loop(t));
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  /* ------------------------------ SAVE / LOAD --------------------------- */
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.meta)); } catch (e) {}
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const def = defaultMeta();
        this.meta = Object.assign(def, data);
        this.meta.resources = Object.assign(def.resources, data.resources || {});
        this.meta.upgrades = Object.assign(def.upgrades, data.upgrades || {});
        this.meta.priceMods = Object.assign(def.priceMods, data.priceMods || {});
      }
    } catch (e) { this.meta = defaultMeta(); }
  }
  /* ------------------------------ ECONOMY ------------------------------- */
  sellPrice(type) {
    const base = RESOURCE_TYPES[type].price * this.meta.priceMods[type];
    const mult = 1 + 0.10 * this.meta.upgrades.marketContacts;
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
    if (!this.canBuy(key)) { Sound.hurt(); return; }
    const c = this.upgradeCost(key);
    this.meta.credits -= c.credits;
    for (const r in c.res) this.meta.resources[r] -= c.res[r];
    this.meta.upgrades[key]++;
    this.save();
    Sound.deliver();
  }
  /* ------------------------------ RUN SETUP ----------------------------- */
  startRun() {
    this.state = 'playing';
    this.particles = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.hives = [];
    this.resources = [];
    this.turrets = [];
    this.mines = [];
    this.scanPulse = null;
    this.scanRevealT = 0;
    this.arcBeam = null;
    this.toasts = [];
    this.evacT = 0;
    this.evacuating = false;

    this.run = {
      time: 0, kills: 0, score: 0,
      deliveredValue: 0, delivered: {},
      hivesDestroyed: 0, maxHiveLevelKilled: 0,
      reactorActivated: false, reactorTimer: 0,
      muleLost: false, threat: 0, threatT: 90,
      spawnT: 5
    };

    // outpost near center, offset
    const ox = WORLD_W / 2 + rand(-250, 250);
    const oy = WORLD_H / 2 + rand(-250, 250);
    this.outpost = new Outpost(this, ox, oy);
    this.player = new Player(this, ox + 140, oy + 140);
    this.mule = new Mule(this, ox + 200, oy + 200);
    this.camera.x = this.player.x - this.canvas.width / 2;
    this.camera.y = this.player.y - this.canvas.height / 2;

    // decorations
    this.deco = [];
    for (let i = 0; i < 90; i++) {
      this.deco.push({
        x: rand(0, WORLD_W), y: rand(0, WORLD_H),
        r: rand(8, 45), t: randInt(0, 2), ph: rand(0, TAU)
      });
    }
    // hives
    const nHives = randInt(3, 5);
    for (let i = 0; i < nHives; i++) {
      let hx, hy, ok = false, tries = 0;
      while (!ok && tries++ < 80) {
        hx = rand(250, WORLD_W - 250);
        hy = rand(250, WORLD_H - 250);
        ok = dist(hx, hy, ox, oy) > 650;
        for (const h of this.hives) if (dist(hx, hy, h.x, h.y) < 550) ok = false;
      }
      this.hives.push(new Hive(this, hx, hy));
    }
    // resources
    const types = ['bioResin', 'bioResin', 'bioResin', 'salvageChips', 'salvageChips', 'sporeFiber', 'sporeFiber', 'softQuartz'];
    const nRes = randInt(35, 50);
    for (let i = 0; i < nRes; i++) {
      let rx, ry, ok = false, tries = 0;
      while (!ok && tries++ < 60) {
        rx = rand(120, WORLD_W - 120);
        ry = rand(120, WORLD_H - 120);
        ok = dist(rx, ry, ox, oy) > 180;
      }
      this.resources.push(new ResourceNode(this, rx, ry, pick(types)));
    }
    // starting enemies near hives
    for (const h of this.hives) {
      const n = randInt(2, 4);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = rand(60, 160);
        this.enemies.push(new Enemy(this, 'skitterling', h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, 1));
      }
    }
    // mission
    this.mission = new Mission(this, pick(Object.keys(MISSIONS)));
    this.toast('Миссия: ' + this.mission.def.name + ' — ' + this.mission.def.brief);
    Sound.evac();
  }
  /* ------------------------------ THREAT -------------------------------- */
  threatLevel() { return Math.min(5, Math.floor(this.run ? this.run.threat : 0)); }
  addThreat(v) {
    if (!this.run) return;
    const before = this.threatLevel();
    this.run.threat = clamp(this.run.threat + v, 0, 5);
    if (this.threatLevel() > before) {
      this.toast('УГРОЗА ПОВЫШЕНА: уровень ' + this.threatLevel());
      Sound.alarm();
    }
  }
  /* ------------------------------ END RUN -------------------------------- */
  finishRun(died) {
    const r = this.run, m = this.meta;
    const credits = r.deliveredValue;
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
    const score = r.score + r.deliveredValue + (this.mission.complete ? 100 : 0);
    m.bestScore = Math.max(m.bestScore, score);
    this.rerollPrices();
    this.save();
    this.endSummary = {
      died, credits, bonusCr, hydro,
      missionComplete: this.mission.complete,
      missionBonus: this.mission.bonus,
      missionName: this.mission.def.name,
      kills: r.kills, hives: r.hivesDestroyed,
      delivered: Object.assign({}, r.delivered),
      deliveredValue: r.deliveredValue,
      time: r.time, score
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
  loop(t) {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    this.update(dt);
    this.draw();
    Input.endFrame();
    requestAnimationFrame(tt => this.loop(tt));
  }
  update(dt) {
    this.uiBlocksFire = this.state !== 'playing';
    for (const ts of this.toasts) ts.t -= dt;
    this.toasts = this.toasts.filter(ts => ts.t > 0);

    switch (this.state) {
      case 'playing': this.updatePlaying(dt); break;
      case 'paused':
        if (Input.wasPressed('Escape')) this.state = 'playing';
        break;
      case 'station':
      case 'death':
      case 'victory':
        break;
    }
  }
  updatePlaying(dt) {
    const r = this.run, p = this.player;
    r.time += dt;

    if (Input.wasPressed('Escape')) { this.state = 'paused'; return; }
    if (Input.wasPressed('m')) this.showMinimap = !this.showMinimap;
    if (Input.wasPressed('Tab')) this.showStats = !this.showStats;

    // evac
    const nearOutpost = dist(p.x, p.y, this.outpost.x, this.outpost.y) < 220;
    if (Input.wasPressed('v')) {
      if (nearOutpost && !this.evacuating) {
        this.evacuating = true;
        this.evacT = p.signal < 10 ? 8 : 4;
        this.toast('Эвакуация началась — не покидай аванпост!');
        Sound.evac();
      } else if (!nearOutpost) {
        this.toast('Эвакуация возможна только рядом с аванпостом');
      }
    }
    if (this.evacuating) {
      if (!nearOutpost) { this.evacuating = false; this.toast('Эвакуация прервана'); }
      else {
        this.evacT -= dt;
        if (this.evacT <= 0) { this.evacuate(); return; }
      }
    }

    // threat over time
    r.threatT -= dt;
    if (r.threatT <= 0) { r.threatT = 90; this.addThreat(1); }
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
    p.signal = clamp(p.signal - drop * sigDrop * dt, 0, 100);
    if (this.outpost.active && nearOutpost) p.signal = clamp(p.signal + 6 * dt, 0, 100);
    else if (dist(p.x, p.y, this.outpost.x, this.outpost.y) < 350) p.signal = clamp(p.signal + 2 * dt, 0, 100);

    // ambient spawn pressure
    r.spawnT -= dt;
    const minutes = r.time / 60;
    const interval = Math.max(1.6, 9 - this.threatLevel() * 0.9 - minutes * 0.3);
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
        const e = new Enemy(this, pick(pool), sx, sy, 1 + Math.floor(tl / 2));
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
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    for (const t of this.turrets) if (!t.dead) t.update(dt);
    for (const m of this.mines) if (!m.dead) m.update(dt);
    for (const rs of this.resources) rs.update(dt);

    // projectiles
    for (const pr of this.projectiles) {
      pr.update(dt, this);
      if (pr.dead) continue;
      // vs enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(pr.x, pr.y, e.x, e.y) < (e.radius + pr.radius) * (e.radius + pr.radius)) {
          e.takeDamage(pr.damage, pr.prevX, pr.prevY);
          pr.dead = true;
          break;
        }
      }
      if (pr.dead) continue;
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
    for (const pr of this.enemyProjectiles) {
      pr.update(dt, this);
      if (pr.dead) continue;
      if (dist2(pr.x, pr.y, p.x, p.y) < (p.radius + pr.radius + (p.shield ? 16 : 0)) ** 2) {
        p.takeDamage(pr.damage, pr.x, pr.y);
        pr.dead = true;
        continue;
      }
      if (this.mule && !this.mule.dead &&
        dist2(pr.x, pr.y, this.mule.x, this.mule.y) < (this.mule.radius + pr.radius) ** 2) {
        this.mule.takeDamage(pr.damage * 0.7);
        pr.dead = true;
      }
    }

    // scanner pulse
    if (this.scanPulse) {
      this.scanPulse.r += 700 * dt;
      if (this.scanPulse.r > this.scanPulse.max) this.scanPulse = null;
    }
    this.scanRevealT = Math.max(0, this.scanRevealT - dt);
    if (this.arcBeam) {
      this.arcBeam.t -= dt;
      if (this.arcBeam.t <= 0) this.arcBeam = null;
    }

    // particles
    this.particles = this.particles.filter(pt => pt.update(dt));
    // cleanup
    this.projectiles = this.projectiles.filter(x => !x.dead);
    this.enemyProjectiles = this.enemyProjectiles.filter(x => !x.dead);
    this.enemies = this.enemies.filter(x => !x.dead);
    this.turrets = this.turrets.filter(x => !x.dead);
    this.mines = this.mines.filter(x => !x.dead);
    this.resources = this.resources.filter(x => !x.dead);

    // mission
    this.mission.update(dt);

    // camera
    this.camera.follow(p.x, p.y, dt, this.canvas.width, this.canvas.height);
  }
  /* ------------------------------ DRAW ----------------------------------- */
  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.state === 'station') { this.drawStation(); return; }
    if (!this.run) { this.drawStation(); return; }
    this.drawWorld();
    this.drawHUD();
    if (this.state === 'paused') this.drawPause();
    if (this.state === 'death') this.drawEnd(true);
    if (this.state === 'victory') this.drawEnd(false);
  }
  drawWorld() {
    const ctx = this.ctx, cam = this.camera, W = this.canvas.width, H = this.canvas.height;
    // swamp background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a1410');
    bg.addColorStop(1, '#08100e');
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
      ctx.moveTo(cam.wx(x), 0); ctx.lineTo(cam.wx(x), H);
    }
    for (let y = gy0; y < cam.y + H + grid; y += grid) {
      ctx.moveTo(0, cam.wy(y)); ctx.lineTo(W, cam.wy(y));
    }
    ctx.stroke();
    // world border
    ctx.strokeStyle = 'rgba(255,93,77,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(cam.wx(0), cam.wy(0), WORLD_W, WORLD_H);
    // decorations (bioluminescent swamp)
    const t = performance.now() / 1000;
    for (const d of this.deco) {
      const x = cam.wx(d.x), y = cam.wy(d.y);
      if (x < -80 || y < -80 || x > W + 80 || y > H + 80) continue;
      const p = Math.sin(t * 1.2 + d.ph) * 0.5 + 0.5;
      if (d.t === 0) { // glow puddle
        ctx.fillStyle = 'rgba(40,180,140,' + (0.04 + p * 0.04) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, d.r * 1.4, d.r * 0.8, 0, 0, TAU); ctx.fill();
      } else if (d.t === 1) { // glow plant
        ctx.strokeStyle = 'rgba(110,230,170,' + (0.18 + p * 0.2) + ')';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i - 1.5) * 0.4 + Math.sin(t + d.ph + i) * 0.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * d.r * 0.5, y + Math.sin(a) * d.r * 0.8,
            x + Math.cos(a) * d.r * 0.7, y + Math.sin(a) * d.r);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(150,255,200,' + (0.3 + p * 0.4) + ')';
        ctx.beginPath(); ctx.arc(x, y - d.r * 0.7, 2.5, 0, TAU); ctx.fill();
      } else { // rock
        ctx.fillStyle = 'rgba(50,70,75,0.5)';
        ctx.beginPath();
        ctx.moveTo(x - d.r * 0.5, y + d.r * 0.3);
        ctx.lineTo(x, y - d.r * 0.4);
        ctx.lineTo(x + d.r * 0.5, y + d.r * 0.3);
        ctx.closePath(); ctx.fill();
      }
    }
    // entities
    this.outpost.draw(ctx, cam);
    for (const m of this.mines) m.draw(ctx, cam);
    const revealed = this.scanRevealT > 0;
    for (const r of this.resources) r.draw(ctx, cam, revealed);
    for (const h of this.hives) h.draw(ctx, cam);
    if (this.mule) this.mule.draw(ctx, cam);
    for (const tr of this.turrets) tr.draw(ctx, cam);
    for (const e of this.enemies) e.draw(ctx, cam);
    if (!this.player.dead) this.player.draw(ctx, cam);
    for (const pr of this.projectiles) pr.draw(ctx, cam);
    for (const pr of this.enemyProjectiles) pr.draw(ctx, cam);
    // arc beam
    if (this.arcBeam) {
      ctx.strokeStyle = '#9ab2ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const pts = this.arcBeam.pts;
      ctx.moveTo(cam.wx(pts[0].x), cam.wy(pts[0].y));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const mx = (a.x + b.x) / 2 + rand(-8, 8), my = (a.y + b.y) / 2 + rand(-8, 8);
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
      ctx.strokeStyle = 'rgba(122,245,255,' + (a * 0.7) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cam.wx(this.scanPulse.x), cam.wy(this.scanPulse.y), this.scanPulse.r, 0, TAU);
      ctx.stroke();
    }
    // particles
    for (const pt of this.particles) pt.draw(ctx, cam);
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
      ctx.fillText('ЭВАКУАЦИЯ ' + this.evacT.toFixed(1) + 'с', cam.wx(p.x), cam.wy(p.y) - p.radius - 34);
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
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const p = this.player, r = this.run;
    const gl = this.glitch();
    ctx.save();
    ctx.translate(gl.x, gl.y);

    // left bars
    let y = 14;
    const bw = 190, bh = 16;
    this.bar(ctx, 14, y, bw, bh, p.health / p.maxHealth, '#3ddc6a', 'HP', Math.ceil(p.health) + '/' + p.maxHealth); y += bh + 4;
    this.bar(ctx, 14, y, bw, bh, 1, '#8aa3b5', 'ARMOR', p.armor.toString()); y += bh + 4;
    this.bar(ctx, 14, y, bw, bh, p.energy / p.maxEnergy, '#ffd35d', 'ENERGY', Math.floor(p.energy) + ''); y += bh + 4;
    const sigColor = p.signal > 60 ? '#7af5ff' : (p.signal > 30 ? '#ffd35d' : '#ff5d4d');
    this.bar(ctx, 14, y, bw, bh, p.signal / 100, sigColor, 'SIGNAL', Math.floor(p.signal) + '%'); y += bh + 10;

    // weapon
    const ws = p.weapons[p.weaponKey], def = ws.def;
    ctx.fillStyle = 'rgba(8,16,20,0.75)';
    ctx.fillRect(14, y, bw, 40);
    ctx.strokeStyle = 'rgba(180,220,230,0.35)';
    ctx.strokeRect(14, y, bw, 40);
    ctx.fillStyle = def.color;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('[' + def.slot + '] ' + def.name, 20, y + 16);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    if (def.useHeat) {
      const txt = ws.overheated ? 'ПЕРЕГРЕВ!' : 'HEAT ' + Math.floor(ws.heat) + '%';
      ctx.fillText(txt, 20, y + 32);
      ctx.fillStyle = ws.overheated ? '#ff5d4d' : '#6e8bff';
      ctx.fillRect(95, y + 24, 100 * (ws.heat / 100), 8);
    } else if (ws.reloadT > 0) {
      ctx.fillText('ПЕРЕЗАРЯДКА...', 20, y + 32);
    } else {
      ctx.fillText('AMMO ' + ws.ammo + '/' + def.magSize + '  [R]', 20, y + 32);
    }
    y += 48;

    // devices
    const devs = [
      ['Q', 'Турель', p.dev.turret, 25],
      ['F', 'Щит', p.dev.shield, 18],
      ['C', 'Скан', p.dev.scanner, 12],
      ['X', 'Мина', p.dev.mine, 10]
    ];
    let dx = 14;
    for (const [key, name, cd, max] of devs) {
      const ready = cd <= 0;
      ctx.fillStyle = ready ? 'rgba(20,46,40,0.85)' : 'rgba(8,16,20,0.75)';
      ctx.fillRect(dx, y, 44, 34);
      ctx.strokeStyle = ready ? '#2ee6a8' : 'rgba(120,140,150,0.4)';
      ctx.strokeRect(dx, y, 44, 34);
      ctx.fillStyle = ready ? '#aef5dc' : '#7a8b99';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(key, dx + 4, y + 13);
      ctx.font = '9px monospace';
      ctx.fillText(ready ? name : Math.ceil(cd) + 'с', dx + 4, y + 27);
      dx += 48;
    }
    y += 42;

    // carry
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    ctx.fillText('Груз: ' + p.carryWeight() + '/' + p.carryCapacity + ' вес  •  Сдано: ' + r.deliveredValue + ' cr', 14, y + 10);
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
      ctx.fillText('Mule-3: ' + Math.ceil(this.mule.hp) + '/' + this.mule.maxHp + ' HP  •  слоты ' + this.mule.cargo.length + '/' + this.mule.cargoSlots, 14, y + 10);
    } else {
      ctx.fillStyle = '#ff8d8d';
      ctx.fillText('Mule-3: УНИЧТОЖЕН', 14, y + 10);
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
    ctx.fillText(this.mission.def.name + (this.mission.complete ? ' ✔ ВЫПОЛНЕНО — эвакуируйся [V]' : ''), W / 2, 28);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '12px monospace';
    ctx.fillText(this.mission.objectiveText(), W / 2, 45);
    const tl = this.threatLevel();
    ctx.fillStyle = tl >= 4 ? '#ff5d4d' : (tl >= 2 ? '#ffd35d' : '#7af5ff');
    ctx.fillText('THREAT ' + tl + '/5  ' + '█'.repeat(tl) + '░'.repeat(5 - tl) + '   ⏱ ' + fmtTime(r.time), W / 2, 61);
    ctx.textAlign = 'left';

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
    ctx.fillText('WASD движение • ЛКМ огонь • E взаимодействие • Shift рывок • V эвакуация • M карта • Esc пауза', 14, H - 10);

    // minimap
    if (this.showMinimap) this.drawMinimap();
    if (this.showStats) this.drawStatsOverlay();
    ctx.restore();
  }
  drawMinimap() {
    const ctx = this.ctx, W = this.canvas.width;
    const size = 170, mx = W - size - 14, my = 14;
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
    ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(190,220,230,0.6)';
    ctx.font = '9px monospace';
    ctx.fillText('MORROW FEN [M]', mx + 4, my + size - 5);
  }
  drawStatsOverlay() {
    const ctx = this.ctx, W = this.canvas.width;
    const x = W - 230, y = 200, w = 216;
    ctx.fillStyle = 'rgba(6,14,16,0.85)';
    ctx.fillRect(x, y, w, 150);
    ctx.strokeStyle = 'rgba(122,245,255,0.35)';
    ctx.strokeRect(x, y, w, 150);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('СТАТИСТИКА ВЫЛАЗКИ [Tab]', x + 8, y + 16);
    ctx.fillStyle = '#dff6ff';
    ctx.font = '11px monospace';
    const r = this.run;
    const lines = [
      'Убийств: ' + r.kills,
      'Ульев уничтожено: ' + r.hivesDestroyed,
      'Сдано: ' + r.deliveredValue + ' cr',
      'Угроза: ' + r.threat.toFixed(1) + '/5',
      'Очки: ' + r.score,
      'Кредиты станции: ' + this.meta.credits
    ];
    lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 36 + i * 18));
  }
  /* ------------------------------ UI BUTTONS ----------------------------- */
  button(x, y, w, h, label, cb, enabled, color) {
    const ctx = this.ctx;
    const hover = Input.mouseX >= x && Input.mouseX <= x + w && Input.mouseY >= y && Input.mouseY <= y + h;
    const en = enabled !== false;
    ctx.fillStyle = en ? (hover ? 'rgba(46,230,168,0.25)' : 'rgba(20,40,38,0.85)') : 'rgba(20,26,30,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = en ? (color || '#2ee6a8') : 'rgba(110,130,140,0.4)';
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
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const m = this.meta;
    // starfield bg
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#070b14');
    bg.addColorStop(1, '#0a1410');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const t = performance.now() / 1000;
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5) % W, sy = (i * 89.3) % H;
      const tw = Math.sin(t * 2 + i) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(200,230,255,' + (0.15 + tw * 0.3) + ')';
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    // planet
    const px = W * 0.85, py = H * 0.8;
    const pg = ctx.createRadialGradient(px - 30, py - 30, 20, px, py, 160);
    pg.addColorStop(0, '#1f5a48');
    pg.addColorStop(1, '#0a2018');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, 160, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(93,255,160,0.12)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(px + Math.sin(i * 2.3) * 80, py + Math.cos(i * 1.7) * 80, 38, 14, i, 0, TAU);
      ctx.fill();
    }

    // header
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('СТАНЦИЯ PALE HARBOR', 40, 50);
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText('Орбита Morrow Fen • Год 2184 • Вылазок: ' + m.runCount + ' • Рекорд: ' + m.bestScore, 40, 70);

    // credits + resources
    ctx.fillStyle = '#ffd35d';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('CREDITS: ' + m.credits, 40, 100);
    let rx = 40;
    ctx.font = '12px monospace';
    for (const k in RESOURCE_TYPES) {
      ctx.fillStyle = RESOURCE_TYPES[k].color;
      const txt = RESOURCE_TYPES[k].name + ': ' + m.resources[k] + '  (цена ' + this.sellPrice(k) + ')';
      ctx.fillText('◆ ' + txt, rx, 122);
      rx += ctx.measureText('◆ ' + txt).width + 22;
      if (rx > W - 260) { rx = 40; }
    }

    // upgrades panel
    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('УЛУЧШЕНИЯ СТАНЦИИ', 40, 158);
    const keys = Object.keys(UPGRADES);
    const colW = Math.min(440, (W - 100) / 2);
    keys.forEach((k, i) => {
      const def = UPGRADES[k];
      const lvl = m.upgrades[k];
      const col = i % 2, row = Math.floor(i / 2);
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
        this.button(x + colW - 92, y + 38, 82, 24, 'КУПИТЬ', () => this.buyUpgrade(k), this.canBuy(k));
      } else {
        ctx.fillStyle = '#2ee6a8';
        ctx.fillText('МАКСИМУМ', x + 10, y + 52);
      }
    });

    // start button
    this.button(W / 2 - 150, H - 80, 300, 46, '▶ START NEW EXPEDITION', () => this.startRun(), true, '#7af5ff');
    ctx.fillStyle = 'rgba(190,220,230,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Клон Vanguard будет высажен на Morrow Fen. Миссия выбирается случайно.', W / 2, H - 24);
    ctx.textAlign = 'left';
  }
  /* ------------------------------ PAUSE ----------------------------------- */
  drawPause() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = 'rgba(4,8,10,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7af5ff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ПАУЗА', W / 2, H / 2 - 90);
    ctx.textAlign = 'left';
    this.button(W / 2 - 130, H / 2 - 50, 260, 40, 'ПРОДОЛЖИТЬ [Esc]', () => this.state = 'playing');
    this.button(W / 2 - 130, H / 2 + 2, 260, 40, 'ПЕРЕЗАПУСТИТЬ ВЫЛАЗКУ', () => this.startRun());
    this.button(W / 2 - 130, H / 2 + 54, 260, 40, 'ВЕРНУТЬСЯ НА СТАНЦИЮ', () => {
      // abandoning run: deliveries are kept
      this.finishRun(true);
      this.state = 'station';
    }, true, '#ff8d8d');
  }
  /* ------------------------------ END SCREENS ----------------------------- */
  drawEnd(died) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const s = this.endSummary;
    if (!s) { this.state = 'station'; return; }
    ctx.fillStyle = 'rgba(4,8,10,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (died) {
      ctx.fillStyle = '#ff5d4d';
      ctx.font = 'bold 34px monospace';
      ctx.fillText('CLONE LOST', W / 2, H / 2 - 150);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '13px monospace';
      ctx.fillText('Связь с клоном потеряна. Доставленный груз сохранён станцией.', W / 2, H / 2 - 122);
    } else {
      ctx.fillStyle = s.missionComplete ? '#2ee6a8' : '#ffd35d';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(s.missionComplete ? 'MISSION COMPLETE' : 'PARTIAL EXTRACTION', W / 2, H / 2 - 150);
      ctx.fillStyle = '#9fb6c4';
      ctx.font = '13px monospace';
      ctx.fillText('Клон возвращён на станцию Pale Harbor.', W / 2, H / 2 - 122);
    }
    ctx.fillStyle = '#dff6ff';
    ctx.font = '14px monospace';
    const lines = [
      'Миссия: ' + s.missionName + (s.missionComplete ? ' — выполнена' : ' — не выполнена') + (s.missionBonus ? ' (+бонус!)' : ''),
      'Время: ' + fmtTime(s.time) + '   Убийств: ' + s.kills + '   Ульев: ' + s.hives,
      'Доставлено: ' + s.deliveredValue + ' cr',
      'Кредиты: +' + s.credits + (s.bonusCr ? '  (бонус миссии +' + s.bonusCr + ')' : ''),
      s.hydro ? 'Гидропоника: +' + s.hydro + ' Bio Resin' : '',
      'Очки: ' + s.score + '   Рекорд: ' + this.meta.bestScore
    ].filter(Boolean);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 80 + i * 26));
    // delivered breakdown
    let dl = 'Сдано: ';
    const dk = Object.keys(s.delivered);
    if (dk.length === 0) dl += 'ничего';
    else dl += dk.map(k => RESOURCE_TYPES[k].name + ' ×' + s.delivered[k]).join(', ');
    ctx.fillStyle = '#9fb6c4';
    ctx.font = '12px monospace';
    ctx.fillText(dl, W / 2, H / 2 + 86);
    ctx.textAlign = 'left';
    this.button(W / 2 - 130, H / 2 + 110, 260, 42, 'НА СТАНЦИЮ', () => { this.state = 'station'; });
  }
}

/* ================================= BOOT ================================= */
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  window.game = new Game(canvas);
});
