import { TAU, clamp, lerp, rand, dist, angleTo } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { WORLD_W, WORLD_H, RESOURCE_TYPES } from '../config/data.js';
import { burst } from '../entities/particles.js';
import { ResourceNode } from './resource.js';

/* ================================ MULE ================================== */
class Mule {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
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
        const a = rand(0, TAU),
          d = rand(10, 50);
        this.game.resources.push(
          new ResourceNode(this.game, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, c)
        );
      }
      this.cargo = [];
      this.game.toast('Mule-3 destroyed! Cargo scattered.');
    }
  }
  update(dt) {
    if (this.dead) return;
    const g = this.game,
      p = g.player;
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
      if (Math.random() < dt * 6)
        burst(g, this.x + rand(-15, 15), this.y + rand(-15, 15), '#5dffc8', 1, 30, 2, 0.4);
    }
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
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
      const cx = -16 + (i % 2) * 14,
        cy = -8 + Math.floor(i / 2) * 14;
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

export { Mule };
