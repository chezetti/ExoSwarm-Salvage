import { TAU } from '../core/utils.js';
import { WORLD_W, WORLD_H } from '../config/data.js';

/* ============================ PROJECTILE ================================ */
class Projectile {
  constructor(x, y, angle, speed, damage, radius, color, friendly, range) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = radius;
    this.color = color;
    this.friendly = friendly;
    this.life = (range || 700) / speed;
    this.dead = false;
    this.prevX = x;
    this.prevY = y;
  }
  update(dt, game) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (
      this.life <= 0 ||
      this.x < -50 ||
      this.y < -50 ||
      this.x > WORLD_W + 50 ||
      this.y > WORLD_H + 50
    )
      this.dead = true;
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

export { Projectile };
