import { TAU, dist, angleTo, angleDiff } from '../core/utils.js';
import { WORLD_W, WORLD_H } from '../config/data.js';

/* ============================ PROJECTILE ================================ */
class Projectile {
  constructor(x, y, angle, speed, damage, radius, color, friendly, range, opts = {}) {
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
    // optional behaviors (railgun pierce, flak AOE, status on hit)
    this.pierce = !!opts.pierce;
    this.aoe = opts.aoe || 0;
    this.status = opts.status || null;
    // homing (steer toward nearest enemy), bounce (ricochet count), lob (mortar fuse + ground target)
    this.homing = opts.homing ? opts.homingTurn || 4 : 0;
    this.speed = Math.hypot(this.vx, this.vy);
    this.bounce = opts.bounce || 0;
    this.lob = !!opts.lob;
    this.fuse = opts.fuse || 0;
    this.hitSet = this.pierce ? new Set() : null;
    this.aoeDone = false;
  }
  update(dt, game) {
    this.prevX = this.x;
    this.prevY = this.y;
    // homing: rotate the velocity toward the nearest enemy by a capped turn rate
    if (this.homing && game) {
      let best = null,
        bd = Infinity;
      game.enemyGrid.queryCircle(this.x, this.y, 520, (e) => {
        if (e.dead) return false;
        const d = dist(this.x, this.y, e.x, e.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
        return false;
      });
      if (best) {
        const cur = Math.atan2(this.vy, this.vx);
        const want = angleTo(this.x, this.y, best.x, best.y);
        const turn = Math.max(-this.homing * dt, Math.min(this.homing * dt, angleDiff(cur, want)));
        const a = cur + turn;
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    // lob/mortar: detonate (via aoe) when the fuse expires
    if (this.lob) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.dead = true;
      return;
    }
    // ricochet: reflect off world bounds, consuming a bounce; clamp inside so
    // it can't re-trigger the same wall next frame
    if (this.bounce > 0) {
      let bounced = false;
      if (this.x < 0) {
        this.x = 0;
        this.vx = Math.abs(this.vx);
        bounced = true;
      } else if (this.x > WORLD_W) {
        this.x = WORLD_W;
        this.vx = -Math.abs(this.vx);
        bounced = true;
      }
      if (this.y < 0) {
        this.y = 0;
        this.vy = Math.abs(this.vy);
        bounced = true;
      } else if (this.y > WORLD_H) {
        this.y = WORLD_H;
        this.vy = -Math.abs(this.vy);
        bounced = true;
      }
      if (bounced && --this.bounce <= 0) this.dead = true;
      if (this.life <= 0) this.dead = true;
      return;
    }
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
