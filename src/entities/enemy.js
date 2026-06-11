import { TAU, clamp, rand, dist, dist2, angleTo, angleDiff } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { WORLD_W, WORLD_H, ENEMY_TYPES } from '../config/data.js';
import { burst } from './particles.js';
import { Projectile } from './projectile.js';
import { ResourceNode } from '../world/resource.js';

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
    this.x = x;
    this.y = y;
    this.radius = t.radius;
    this.attackT = rand(0, t.attackCd);
    this.dead = false;
    this.facing = rand(0, TAU);
    this.hitFlash = 0;
    this.shielded = false; // warden aura
    this.chargeT = rand(2, 4); // bull
    this.charging = 0;
    this.wobble = rand(0, TAU);
    this.target = null; // 'player' | 'mule' | 'outpost'
    this.homeX = x;
    this.homeY = y;
    this.aggro = false;
    this.wanderA = rand(0, TAU);
    this.wanderT = rand(0.5, 2);
  }
  pickTarget() {
    const g = this.game,
      p = g.player;
    let tx = p.x,
      ty = p.y,
      tt = 'player';
    if (g.threatLevel() >= 4) {
      // prefer mule / outpost sometimes
      if (g.mule && !g.mule.dead) {
        const dm = dist(this.x, this.y, g.mule.x, g.mule.y);
        const dp = dist(this.x, this.y, p.x, p.y);
        if (dm < dp * 0.9 && Math.random() < 0.6) {
          tx = g.mule.x;
          ty = g.mule.y;
          tt = 'mule';
        }
      }
      if (tt === 'player' && g.outpost.active && Math.random() < 0.12) {
        tx = g.outpost.x;
        ty = g.outpost.y;
        tt = 'outpost';
      }
    } else if (this.typeKey === 'carapaceBull' && g.mule && !g.mule.dead && Math.random() < 0.25) {
      const dm = dist(this.x, this.y, g.mule.x, g.mule.y);
      if (dm < 420) {
        tx = g.mule.x;
        ty = g.mule.y;
        tt = 'mule';
      }
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
    const g = this.game,
      p = g.player;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.attackT -= dt;
    this.wobble += dt * 6;
    // Aggro / leash: idle enemies guard their spawn area until the player
    // (or mule) comes close, they take damage, or global threat is high.
    if (!this.aggro) {
      const dp = dist(this.x, this.y, p.x, p.y);
      const dm = g.mule && !g.mule.dead ? dist(this.x, this.y, g.mule.x, g.mule.y) : Infinity;
      if (dp < 460 || dm < 360 || g.threatLevel() >= 3) {
        this.aggro = true;
      } else {
        // lazy wander around home point
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(1.2, 3);
          const dh = dist(this.x, this.y, this.homeX, this.homeY);
          this.wanderA = dh > 160 ? angleTo(this.x, this.y, this.homeX, this.homeY) : rand(0, TAU);
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
    if (te && !te.dead) {
      this.target.x = te.x;
      this.target.y = te.y;
    }
    const tx = this.target.x,
      ty = this.target.y;
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
          this.x +=
            Math.cos(aimA + Math.PI / 2) * Math.sin(this.wobble * 0.7) * this.speed * 0.5 * dt;
          this.y +=
            Math.sin(aimA + Math.PI / 2) * Math.sin(this.wobble * 0.7) * this.speed * 0.5 * dt;
        }
        if (d < this.def.range && this.attackT <= 0) {
          this.attackT = this.def.attackCd;
          g.enemyProjectiles.push(
            new Projectile(
              this.x,
              this.y,
              aimA + rand(-0.06, 0.06),
              300,
              this.damage,
              4,
              '#8aff5d',
              false,
              420
            )
          );
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
          if (d < this.radius + 18) {
            this.tryMelee(te, 1.4);
            this.charging = 0;
          }
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
        if (ad < 1.0) dmg *= 1 - this.def.armor;
        else dmg *= 1 - this.def.armor * 0.4;
      } else dmg *= 1 - this.def.armor * 0.5;
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
    if (Math.random() < 0.1) {
      g.resources.push(
        new ResourceNode(
          g,
          this.x + rand(-8, 8),
          this.y + rand(-8, 8),
          Math.random() < 0.6 ? 'bioResin' : 'salvageChips'
        )
      );
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
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
          ctx.lineTo(
            Math.cos(a + Math.PI) * (this.radius + 5),
            Math.sin(a + Math.PI) * (this.radius + 5)
          );
          ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a0a06';
        ctx.beginPath();
        ctx.arc(Math.cos(this.facing) * 4, Math.sin(this.facing) * 4, this.radius * 0.45, 0, TAU);
        ctx.fill();
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
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e7c4ff';
        ctx.beginPath();
        ctx.arc(this.radius * 0.3, 0, 3.5, 0, TAU);
        ctx.fill();
        break;
      }
      case 'carapaceBull': {
        ctx.rotate(this.facing);
        if (this.charging > 0) {
          ctx.strokeStyle = 'rgba(255,154,61,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, this.radius + 6, 0, TAU);
          ctx.stroke();
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
        ctx.beginPath();
        ctx.arc(0, 0, 150 * 0.35 + Math.sin(this.wobble) * 4, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = flash ? '#fff' : '#ff7da0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 4 + Math.sin(this.wobble * 2) * 2, 0, TAU);
        ctx.stroke();
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
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 2, 0, TAU);
      ctx.fill();
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

export { Enemy };
