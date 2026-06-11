import { clamp, rand, dist, angleTo } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { burst } from '../entities/particles.js';
import { Projectile } from '../entities/projectile.js';

/* =============================== TURRET ================================= */
class Turret {
  constructor(game, x, y, lifetime, permanent) {
    this.game = game;
    this.x = x;
    this.y = y;
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
    let target = null,
      bd = Infinity;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < this.range && d < bd) {
        bd = d;
        target = e;
      }
    }
    if (target) {
      this.aim = angleTo(this.x, this.y, target.x, target.y);
      if (this.fireT <= 0) {
        this.fireT = 0.4;
        this.game.projectiles.push(
          new Projectile(
            this.x + Math.cos(this.aim) * 14,
            this.y + Math.sin(this.aim) * 14,
            this.aim + rand(-0.05, 0.05),
            600,
            this.damage,
            2.5,
            this.permanent ? '#2ee6a8' : '#7af5ff',
            true,
            260
          )
        );
        Sound.blip(620, 0.05, 'square', 0.12, -300);
      }
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    ctx.fillStyle = this.permanent ? '#1c3a32' : '#1c2e3a';
    ctx.strokeStyle = this.permanent ? '#2ee6a8' : '#7af5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 12, y + 9);
    ctx.lineTo(x - 12, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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

export { Turret };
