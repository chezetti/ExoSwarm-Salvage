import { TAU, clamp, rand, dist, angleTo, angleDiff } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { Input } from '../core/input.js';
import { WORLD_W, WORLD_H, RESOURCE_TYPES, WEAPONS, DEVICES } from '../config/data.js';
import { burst } from './particles.js';
import { Projectile } from './projectile.js';
import { Turret } from '../world/turret.js';
import { Mine } from '../world/mine.js';
import { tickStatuses, applyStatus } from '../systems/status.js';
import { Drone } from '../world/drone.js';
import { Decoy } from '../world/decoy.js';
import { drawClone } from './clone.js';
import { defaultAppearance } from '../config/appearance.js';
import { OD_FIRE_MULT, OD_DAMAGE_MULT } from '../systems/overdrive.js';
import { CLASSES } from '../config/classes.js';

/* =============================== PLAYER ================================= */
class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
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
    // weapons/devices come from the station loadout (sanitized against config)
    const lo = m.loadout || {};
    this.slots = (lo.weapons || ['pulse', 'shotgun', 'arc']).filter((k) => WEAPONS[k]).slice(0, 3);
    if (this.slots.length === 0) this.slots = ['pulse', 'shotgun', 'arc'];
    this.weaponKey = this.slots[0];
    this.weapons = {};
    for (const k of this.slots) {
      const w = WEAPONS[k];
      this.weapons[k] = {
        def: w,
        ammo: w.useHeat ? 0 : w.magSize,
        heat: 0,
        overheated: false,
        reloadT: 0,
        cooldownT: 0,
      };
    }
    this.deviceSlots = (lo.devices || ['turret', 'shield', 'scanner', 'mine'])
      .filter((k) => DEVICES[k])
      .slice(0, 4);
    if (this.deviceSlots.length === 0) this.deviceSlots = ['turret', 'shield', 'scanner', 'mine'];
    this.devCdMult = 1 - 0.15 * m.upgrades.deviceCooling;
    this.dev = {};
    for (const k of this.deviceSlots) this.dev[k] = 0;
    this.shield = null; // {hp, t}
    this.invuln = 0;
    this.dead = false;
    this.hitFlash = 0;
    this.muzzle = 0;
    this.statuses = {};
    this.speedMult = 1;
    this.armorShred = 0;
    this.appearance = game.meta.appearance || defaultAppearance();
    // clone class: apply stat multipliers + grant the class ability (G)
    this.classDef = CLASSES[m.class] || CLASSES.vanguard;
    const c = this.classDef;
    this.maxHealth = Math.round(this.maxHealth * (c.hpMult || 1));
    this.health = this.maxHealth;
    this.speed *= c.speedMult || 1;
    this.dashCooldownMax *= c.dashCdMult || 1;
    this.armor += c.armorAdd || 0;
    this.devCdMult *= c.deviceCdMult || 1;
    this.scanRangeMult = c.scanRangeMult || 1;
    this.ability = c.ability;
    this.abilityT = 0; // cooldown remaining
    this.buffT = 0; // active class buff timer
    this.buffKind = null; // 'fireRate' | 'armor'
    // expedition modifiers (Glass Protocol) tune the clone
    const rmods = (game.run && game.run.mods) || null;
    this.modDmgMult = rmods ? rmods.playerDmgMult : 1;
    if (rmods && rmods.playerHpMult !== 1) {
      this.maxHealth = Math.round(this.maxHealth * rmods.playerHpMult);
      this.health = this.maxHealth;
    }
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
    const g = this.game,
      inp = Input;
    // movement
    let mx = 0,
      my = 0;
    if (inp.keys['w']) my -= 1;
    if (inp.keys['s']) my += 1;
    if (inp.keys['a']) mx -= 1;
    if (inp.keys['d']) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    tickStatuses(this, dt, g);
    if (this.dead) return; // burn tick can kill
    // class ability (G) + buff timers (real dt — unaffected by hitstop is fine here)
    this.abilityT = Math.max(0, this.abilityT - dt);
    this.buffT = Math.max(0, this.buffT - dt);
    if (inp.wasPressed('g') && this.ability && this.abilityT <= 0) this.useAbility(mx, my);
    let spd =
      this.speed * (1 - ((0.04 * this.carryWeight()) / Math.max(1, this.carryCapacity)) * 4);
    spd = Math.max(this.speed * 0.7, spd);
    spd *= this.speedMult;

    this.dashCd = Math.max(0, this.dashCd - dt);
    if (inp.wasPressed('Shift') && this.dashCd <= 0 && this.energy >= 25 && len > 0) {
      this.dashCd = this.dashCooldownMax;
      this.dashTime = 0.18;
      this.energy -= 25;
      this.invuln = Math.max(this.invuln, 0.25);
      Sound.device();
      burst(g, this.x, this.y, '#7af5ff', 8, 120, 3, 0.4);
    }
    if (this.dashTime > 0) {
      spd *= 3.1;
      this.dashTime -= dt;
    }

    this.x = clamp(this.x + mx * spd * dt, this.radius, WORLD_W - this.radius);
    this.y = clamp(this.y + my * spd * dt, this.radius, WORLD_H - this.radius);

    this.energy = clamp(this.energy + 12 * dt, 0, this.maxEnergy);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.muzzle = Math.max(0, this.muzzle - dt * 8);

    // aim
    this.aim = angleTo(
      this.x,
      this.y,
      g.camera.toWorldX(inp.mouseX),
      g.camera.toWorldY(inp.mouseY)
    );

    // weapon switching (loadout slots 1/2/3)
    if (inp.wasPressed('1') && this.slots[0]) this.switchWeapon(this.slots[0]);
    if (inp.wasPressed('2') && this.slots[1]) this.switchWeapon(this.slots[1]);
    if (inp.wasPressed('3') && this.slots[2]) this.switchWeapon(this.slots[2]);

    // weapon update
    const ws = this.weapons[this.weaponKey];
    const def = ws.def;
    ws.cooldownT = Math.max(0, ws.cooldownT - dt);
    if (ws.reloadT > 0) {
      ws.reloadT -= dt;
      if (ws.reloadT <= 0) {
        ws.ammo = def.magSize;
        Sound.reload();
      }
    }
    if (def.useHeat) {
      if (!(inp.mouseDown && !ws.overheated)) {
        ws.heat = Math.max(0, ws.heat - def.coolPerSec * dt);
        if (ws.overheated && ws.heat <= def.overheatLock) ws.overheated = false;
      }
    }
    if (inp.wasPressed('r') && !def.useHeat && ws.reloadT <= 0 && ws.ammo < def.magSize) {
      ws.reloadT = def.reloadTime;
      Sound.reload();
    }
    if (inp.mouseDown && !g.uiBlocksFire) this.fire(dt, ws);
    // charge weapons fire on release
    if (def.charge && this._prevMouseDown && !inp.mouseDown && !g.uiBlocksFire)
      this.releaseCharge(ws);
    this._prevMouseDown = inp.mouseDown;

    // shield
    if (this.shield) {
      this.shield.t -= dt;
      if (this.shield.t <= 0 || this.shield.hp <= 0) this.shield = null;
    }
    // device cooldowns
    for (const k in this.dev) this.dev[k] = Math.max(0, this.dev[k] - dt);

    // devices (loadout slots on Q/F/C/X, generic dispatch via DEVICES config)
    const devKeys = ['q', 'f', 'c', 'x'];
    for (let i = 0; i < this.deviceSlots.length; i++) {
      const dk = this.deviceSlots[i];
      if (inp.wasPressed(devKeys[i]) && this.dev[dk] <= 0) this.useDevice(dk);
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
    if (this.weaponKey !== k) {
      const prev = this.weapons[this.weaponKey];
      if (prev) prev.charge = 0; // drop any pending charge when swapping away
      this.weaponKey = k;
      Sound.reload();
    }
  }
  useDevice(key) {
    const g = this.game,
      def = DEVICES[key];
    if (!def) return;
    this.dev[key] = def.cd * this.devCdMult;
    switch (key) {
      case 'turret':
        g.turrets.push(
          new Turret(
            g,
            this.x + Math.cos(this.aim) * 30,
            this.y + Math.sin(this.aim) * 30,
            25,
            false
          )
        );
        Sound.device();
        break;
      case 'shield':
        this.shield = { hp: 80, max: 80, t: 4 };
        Sound.device();
        break;
      case 'scanner':
        g.scanPulse = { x: this.x, y: this.y, r: 0, max: 620 * (this.scanRangeMult || 1) };
        g.scanRevealT = 5 * (this.scanRangeMult || 1);
        Sound.device();
        break;
      case 'mine':
        g.mines.push(new Mine(g, this.x, this.y));
        Sound.device();
        break;
      case 'drone':
        g.drones.push(new Drone(g, this.x, this.y, def.dur));
        Sound.device();
        break;
      case 'decoy':
        g.decoys.push(
          new Decoy(g, this.x + Math.cos(this.aim) * 50, this.y + Math.sin(this.aim) * 50, def.dur)
        );
        Sound.device();
        break;
      case 'emp': {
        g.empPulse = { x: this.x, y: this.y, r: 0, max: def.radius };
        Sound.emp();
        g.camera.addShake(5);
        g.enemyGrid.queryCircle(this.x, this.y, def.radius + 30, (e) => {
          if (!e.dead && dist(this.x, this.y, e.x, e.y) < def.radius + e.radius) {
            applyStatus(e, 'stun');
            e.takeDamage(12, this.x, this.y);
          }
          return false;
        });
        break;
      }
    }
  }
  // Class ability on G. One contained behavioral switch; tuning lives in config.
  useAbility(mx, my) {
    const g = this.game,
      ab = this.ability;
    this.abilityT = ab.cd;
    Sound.device();
    switch (ab.id) {
      case 'overclock': // fire-rate surge
        this.buffKind = 'fireRate';
        this.buffT = ab.dur;
        burst(g, this.x, this.y, '#ffd35d', 14, 140, 3, 0.5);
        break;
      case 'bulwark': // damage reduction
        this.buffKind = 'armor';
        this.buffT = ab.dur;
        burst(g, this.x, this.y, '#8ab4ff', 14, 120, 3, 0.5);
        break;
      case 'blink': {
        // teleport ~190px along movement (or aim if standing still) + brief i-frames
        const a = mx || my ? Math.atan2(my, mx) : this.aim;
        this.x = clamp(this.x + Math.cos(a) * 190, this.radius, WORLD_W - this.radius);
        this.y = clamp(this.y + Math.sin(a) * 190, this.radius, WORLD_H - this.radius);
        this.invuln = Math.max(this.invuln, ab.dur);
        burst(g, this.x, this.y, '#7af5ff', 18, 160, 3, 0.5);
        break;
      }
      case 'repairPulse': {
        // heal the Mule + nearby turrets and a little self
        this.health = Math.min(this.maxHealth, this.health + 40);
        if (g.mule && !g.mule.dead) g.mule.hp = Math.min(g.mule.maxHp, g.mule.hp + 120);
        for (const t of g.turrets) if (!t.dead && t.life !== Infinity) t.life += 8;
        burst(g, this.x, this.y, '#2ee6a8', 18, 130, 3, 0.6);
        break;
      }
    }
  }
  fire(dt, ws) {
    const def = ws.def;
    // charge weapon: build up while held, fire the burst on release (releaseCharge)
    if (def.charge) {
      if (ws.overheated) return;
      ws.charge = Math.min(1, (ws.charge || 0) + dt / 0.8);
      ws.heat += def.heatPerSec * dt * (0.5 + ws.charge);
      if (ws.heat >= 100) {
        ws.heat = 100;
        ws.overheated = true;
        Sound.hurt();
      }
      return;
    }
    if (def.useHeat) {
      if (ws.overheated) return;
      ws.heat += def.heatPerSec * dt;
      if (ws.heat >= 100) {
        ws.heat = 100;
        ws.overheated = true;
        Sound.hurt();
        return;
      }
      ws.cooldownT -= dt;
      if (ws.cooldownT <= 0) {
        ws.cooldownT = 1 / def.tickRate;
        this.fireArc(def);
      }
      return;
    }
    if (ws.reloadT > 0 || ws.cooldownT > 0) return;
    if (ws.ammo <= 0) {
      ws.reloadT = def.reloadTime;
      Sound.reload();
      return;
    }
    const od = this.game.run && this.game.run.odActive > 0;
    const fireBuff = this.buffKind === 'fireRate' && this.buffT > 0 ? 1.6 : 1;
    ws.cooldownT = 1 / (def.fireRate * (od ? OD_FIRE_MULT : 1) * fireBuff);
    ws.ammo--;
    this.muzzle = 1;
    this.spawnShot(
      def,
      def.damage * this.damageMult(def.key) * (od ? OD_DAMAGE_MULT : 1) * (this.modDmgMult || 1)
    );
  }
  // Build and launch a weapon's projectiles. chargeMul scales a charged shot.
  spawnShot(def, dmg, chargeMul = 1) {
    const g = this.game;
    // lobbed weapons (cryo mortar) arc to the cursor and detonate on a fuse
    let aimBase = this.aim,
      lobTarget = null,
      fuse = 0;
    if (def.lob) {
      const tx = g.camera.toWorldX(Input.mouseX),
        ty = g.camera.toWorldY(Input.mouseY);
      aimBase = Math.atan2(ty - this.y, tx - this.x);
      lobTarget = { x: tx, y: ty };
      fuse = Math.min(2, dist(this.x, this.y, tx, ty) / def.projSpeed);
    }
    for (let i = 0; i < def.pellets; i++) {
      const a = aimBase + rand(-def.spread, def.spread);
      const ox = this.x + Math.cos(aimBase) * (this.radius + 6);
      const oy = this.y + Math.sin(aimBase) * (this.radius + 6);
      g.projectiles.push(
        new Projectile(
          ox,
          oy,
          a,
          def.projSpeed * rand(0.93, 1.07),
          dmg,
          def.projRadius * chargeMul,
          def.color,
          true,
          def.range || 700,
          {
            pierce: def.pierce,
            aoe: def.aoe ? def.aoe * chargeMul : 0,
            status: def.status,
            homing: def.homing,
            bounce: def.bounce,
            lob: def.lob,
            fuse,
          }
        )
      );
      if (lobTarget) break; // mortar fires a single shell
    }
    if (def.key === 'shotgun') {
      Sound.shotgun();
      g.camera.addShake(3);
    } else if (def.key === 'railgun') {
      Sound.railgun();
      g.camera.addShake(4);
    } else if (def.key === 'flak') {
      Sound.flak();
      g.camera.addShake(2);
    } else if (def.key === 'homingLauncher') {
      Sound.homing();
      g.camera.addShake(1);
    } else if (def.key === 'ricochet') {
      Sound.ricochet();
      g.camera.addShake(0.6);
    } else if (def.key === 'cryoMortar') {
      Sound.cryo();
      g.camera.addShake(2);
    } else if (def.key === 'chargeBeam') {
      Sound.charge();
      g.camera.addShake(2 + 3 * chargeMul);
    } else {
      Sound.shoot();
      g.camera.addShake(0.7);
    }
  }
  // Release a charged shot (called on mouse-up for charge weapons).
  releaseCharge(ws) {
    const def = ws.def;
    if (!def.charge || ws.overheated) {
      ws.charge = 0;
      return;
    }
    const c = ws.charge || 0;
    ws.charge = 0;
    if (c < 0.15) return; // tap with no meaningful charge
    this.muzzle = 1;
    const mul = 1 + c * 2; // up to 3x at full charge
    this.spawnShot(def, def.damage * mul, 1 + c);
  }
  fireArc(def) {
    const g = this.game;
    // find first target: nearest enemy within range, roughly in aim direction
    let first = null,
      bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > def.range + e.radius) continue;
      const ad = Math.abs(angleDiff(this.aim, angleTo(this.x, this.y, e.x, e.y)));
      if (ad > 0.9) continue;
      if (d < bd) {
        bd = d;
        first = e;
      }
    }
    const chainPts = [
      {
        x: this.x + Math.cos(this.aim) * (this.radius + 4),
        y: this.y + Math.sin(this.aim) * (this.radius + 4),
      },
    ];
    if (first) {
      const hitset = new Set();
      let cur = first;
      for (let i = 0; i < def.chain && cur; i++) {
        hitset.add(cur);
        cur.takeDamage(def.damage, this.x, this.y, 'arc');
        chainPts.push({ x: cur.x, y: cur.y });
        let next = null,
          nd = Infinity;
        for (const e of g.enemies) {
          if (e.dead || hitset.has(e)) continue;
          const d = dist(cur.x, cur.y, e.x, e.y);
          if (d < def.chainRange && d < nd) {
            nd = d;
            next = e;
          }
        }
        cur = next;
      }
    } else {
      chainPts.push({
        x: this.x + Math.cos(this.aim) * def.range,
        y: this.y + Math.sin(this.aim) * def.range,
      });
    }
    g.arcBeam = { pts: chainPts, t: 0.07 };
    Sound.arc();
  }
  tryPickup(r) {
    if (r.dead) return false;
    const def = RESOURCE_TYPES[r.type];
    if (this.carryWeight() + def.weight > this.carryCapacity) {
      this.game.toast(
        'Overloaded! Deliver resources (weight ' +
          this.carryWeight() +
          '/' +
          this.carryCapacity +
          ')'
      );
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
    let best = null,
      bd = Infinity;
    for (const r of g.resources) {
      if (r.dead) continue;
      const d = dist(this.x, this.y, r.x, r.y);
      if (d < 60 && d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best) {
      if (best.weightHeavy()) {
        if (g.mule && !g.mule.dead && dist(this.x, this.y, g.mule.x, g.mule.y) < 140) {
          if (g.mule.loadCargo(best.type)) {
            best.dead = true;
            Sound.pickup();
            burst(g, best.x, best.y, RESOURCE_TYPES[best.type].color, 8, 90, 3, 0.5);
            g.toast(RESOURCE_TYPES[best.type].name + ' loaded into Mule-3');
          } else g.toast('Mule-3 cargo slots are full');
        } else g.toast('Heavy resource: bring Mule-3 closer');
        return;
      } else {
        this.tryPickup(best);
        return;
      }
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
      if (dmg <= 0) {
        Sound.hit();
        return;
      }
    }
    dmg *= 1 - this.armor / (this.armor + 100);
    if (this.buffKind === 'armor' && this.buffT > 0) dmg *= 0.45; // Heavy bulwark
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
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    // glow
    ctx.fillStyle = 'rgba(120,240,255,0.10)';
    ctx.beginPath();
    ctx.arc(x, y, this.radius + 14, 0, TAU);
    ctx.fill();
    // body (procedural, driven by the profile's appearance)
    drawClone(ctx, x, y, this.appearance, 1, this.aim, this.hitFlash, this.muzzle);
    // shield
    if (this.shield) {
      const a = 0.25 + 0.35 * (this.shield.hp / this.shield.max);
      ctx.strokeStyle = 'rgba(110,200,255,' + a + ')';
      ctx.fillStyle = 'rgba(110,200,255,' + a * 0.25 + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 16, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // carried resources orbit
    const t = performance.now() / 600;
    this.carry.forEach((k, i) => {
      const a = t + i * (TAU / Math.max(4, this.carry.length));
      const rx = x + Math.cos(a) * (this.radius + 9);
      const ry = y + Math.sin(a) * (this.radius + 9);
      ctx.fillStyle = RESOURCE_TYPES[k].color;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 4);
      ctx.lineTo(rx + 3, ry);
      ctx.lineTo(rx, ry + 4);
      ctx.lineTo(rx - 3, ry);
      ctx.closePath();
      ctx.fill();
    });
  }
}

export { Player };
