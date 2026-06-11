import { TAU, clamp, rand, dist, angleTo, angleDiff, pick } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { WORLD_W, WORLD_H } from '../config/data.js';
import { burst } from './particles.js';
import { Projectile } from './projectile.js';
import { Enemy } from './enemy.js';
import { ResourceNode } from '../world/resource.js';
import { spawnDamageNumber } from './damageNumber.js';
import { tickStatuses } from '../systems/status.js';

/* ================================ BOSS =================================== */
// Apex Warden — multi-phase boss. Cycle: chase → telegraph (0.9s windup,
// ring + alarm) → attack → recover. The weak point is only exposed during
// recover; while chasing/attacking it takes reduced damage. Attacks unlock
// by phase (hp thirds): slam AOE → + projectile fan → + summon adds.
class Boss {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.maxHp = 2400;
    this.hp = this.maxHp;
    this.radius = 40;
    this.speed = 70;
    this.dead = false;
    this.state = 'chase'; // chase | telegraph | recover
    this.stateT = 2;
    this.attack = null; // 'slam' | 'fan' | 'summon'
    this.facing = 0;
    this.wobble = rand(0, TAU);
    this.weakAngle = rand(0, TAU);
    this.hitFlash = 0;
    this.statuses = {};
    this.speedMult = 1;
    this.armorShred = 0;
  }
  phase() {
    const f = this.hp / this.maxHp;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  }
  update(dt) {
    const g = this.game,
      p = g.player;
    tickStatuses(this, dt, g); // the boss can burn/freeze/corrode too
    if (this.dead) return;
    this.wobble += dt * 3;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.weakAngle += dt * 0.5;
    const aimA = angleTo(this.x, this.y, p.x, p.y);
    this.stateT -= dt;
    if (this.state === 'chase') {
      this.facing = aimA;
      const sp = this.speed * this.speedMult * (this.phase() === 3 ? 1.35 : 1);
      this.x += Math.cos(aimA) * sp * dt;
      this.y += Math.sin(aimA) * sp * dt;
      if (this.stateT <= 0) {
        const ph = this.phase();
        const opts = ['slam'];
        if (ph >= 2) opts.push('fan', 'slam');
        if (ph >= 3) opts.push('summon', 'fan');
        this.attack = pick(opts);
        this.state = 'telegraph';
        this.stateT = 0.9;
        Sound.alarm();
      }
    } else if (this.state === 'telegraph') {
      if (this.stateT <= 0) {
        this.executeAttack();
        this.state = 'recover';
        this.stateT = this.phase() === 3 ? 1.2 : 1.8;
      }
    } else {
      // recover — weak point exposed
      if (this.stateT <= 0) {
        this.state = 'chase';
        this.stateT = rand(1.6, 2.6);
      }
    }
    this.x = clamp(this.x, this.radius, WORLD_W - this.radius);
    this.y = clamp(this.y, this.radius, WORLD_H - this.radius);
  }
  executeAttack() {
    const g = this.game,
      p = g.player;
    if (this.attack === 'slam') {
      const R = 150;
      Sound.explosion();
      g.camera.addShake(10);
      g.hitstop(0.05);
      burst(g, this.x, this.y, '#b02040', 30, 260, 5, 0.9);
      burst(g, this.x, this.y, '#ff7da0', 16, 180, 4, 0.7);
      if (dist(this.x, this.y, p.x, p.y) < R + p.radius) p.takeDamage(34, this.x, this.y);
      if (g.mule && !g.mule.dead && dist(this.x, this.y, g.mule.x, g.mule.y) < R)
        g.mule.takeDamage(40);
    } else if (this.attack === 'fan') {
      Sound.bossRoar();
      const n = 14;
      const base = angleTo(this.x, this.y, p.x, p.y);
      for (let i = 0; i < n; i++) {
        const a = base - 0.9 + (1.8 * i) / (n - 1);
        g.enemyProjectiles.push(
          new Projectile(
            this.x + Math.cos(a) * (this.radius + 6),
            this.y + Math.sin(a) * (this.radius + 6),
            a,
            260,
            16,
            5,
            '#ff5d8a',
            false,
            620
          )
        );
      }
    } else if (this.attack === 'summon') {
      Sound.bossRoar();
      for (let i = 0; i < 3; i++) {
        if (g.enemies.length >= 70) break;
        const a = rand(0, TAU);
        const add = new Enemy(
          g,
          'skitterling',
          this.x + Math.cos(a) * (this.radius + 24),
          this.y + Math.sin(a) * (this.radius + 24),
          2
        );
        add.aggro = true;
        g.enemies.push(add);
      }
      burst(g, this.x, this.y, '#ff7da0', 20, 180, 4, 0.8);
    }
  }
  takeDamage(dmg, fromX, fromY, src) {
    if (this.dead) return;
    let big = false;
    if (this.state === 'recover' && fromX !== undefined) {
      const hitA = angleTo(this.x, this.y, fromX, fromY);
      if (Math.abs(angleDiff(this.weakAngle, hitA)) < 0.6) {
        dmg *= 2;
        big = true;
        burst(
          this.game,
          this.x + Math.cos(this.weakAngle) * this.radius,
          this.y + Math.sin(this.weakAngle) * this.radius,
          '#ffe27a',
          6,
          120,
          3,
          0.4
        );
      }
    } else if (this.state !== 'recover') {
      dmg *= 0.55; // hardened carapace while chasing/attacking
    }
    this.hp -= dmg;
    this.hitFlash = 1;
    if (src !== 'status') Sound.hit();
    spawnDamageNumber(
      this.game,
      this.x,
      this.y - this.radius - 8,
      Math.max(1, Math.round(dmg)),
      big ? '#ffe27a' : '#ffe9a8',
      big
    );
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    g.run.bossSlain = true;
    g.run.bossKillT = g.run.time;
    g.run.kills++;
    g.run.score += 150;
    g.hitstop(0.06);
    g.camera.addShake(14);
    Sound.hiveDie();
    Sound.bossRoar();
    burst(g, this.x, this.y, '#ff5d8a', 50, 300, 7, 1.6);
    burst(g, this.x, this.y, '#ffe27a', 30, 220, 5, 1.2);
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU),
        dd = rand(30, 90);
      g.resources.push(
        new ResourceNode(
          g,
          this.x + Math.cos(a) * dd,
          this.y + Math.sin(a) * dd,
          i < 3 ? 'hiveEnzymes' : 'softQuartz'
        )
      );
    }
    g.toast('APEX WARDEN DESTROYED!');
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    const p = Math.sin(this.wobble) * 0.5 + 0.5;
    // telegraph warning
    if (this.state === 'telegraph') {
      const frac = 1 - this.stateT / 0.9;
      if (this.attack === 'slam') {
        ctx.strokeStyle = 'rgba(255,93,77,' + (0.3 + frac * 0.5) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 150 * frac, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,93,77,0.25)';
        ctx.beginPath();
        ctx.arc(x, y, 150, 0, TAU);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,93,138,' + (0.3 + frac * 0.5) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, this.radius + 10 + frac * 8, 0, TAU);
        ctx.stroke();
      }
    }
    // aura
    ctx.strokeStyle = 'rgba(255,80,120,0.3)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, this.radius + 14 + p * 5, 0, TAU);
    ctx.stroke();
    // body
    const grad = ctx.createRadialGradient(x, y, 6, x, y, this.radius);
    grad.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#d04060');
    grad.addColorStop(0.6, '#8a1430');
    grad.addColorStop(1, '#4a0a1c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, this.radius, 0, TAU);
    ctx.fill();
    // spikes
    ctx.strokeStyle = '#ff7da0';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = this.facing + (i * TAU) / 8 + Math.sin(this.wobble + i) * 0.1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * this.radius * 0.8, y + Math.sin(a) * this.radius * 0.8);
      ctx.lineTo(
        x + Math.cos(a) * (this.radius + 12 + p * 4),
        y + Math.sin(a) * (this.radius + 12 + p * 4)
      );
      ctx.stroke();
    }
    // eyes toward facing
    ctx.fillStyle = '#ffe27a';
    for (const s of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(this.facing + s) * this.radius * 0.55,
        y + Math.sin(this.facing + s) * this.radius * 0.55,
        3.5,
        0,
        TAU
      );
      ctx.fill();
    }
    // weak point while recovering
    if (this.state === 'recover') {
      const wx2 = x + Math.cos(this.weakAngle) * this.radius;
      const wy2 = y + Math.sin(this.weakAngle) * this.radius;
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(wx2, wy2, 7 + p * 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,226,122,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx2, wy2, 11 + p * 3, 0, TAU);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9e6';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('APEX WARDEN', x, y - this.radius - 20);
    ctx.textAlign = 'left';
  }
}

export { Boss };
