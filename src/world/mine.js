import { TAU, dist, dist2 } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { burst } from '../entities/particles.js';

/* ================================ MINE ================================== */
class Mine {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
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
      if (!h.destroyed && dist(this.x, this.y, h.x, h.y) < 80 + h.radius)
        h.takeDamage(90, this.x, this.y);
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    ctx.fillStyle = '#2a3640';
    ctx.strokeStyle = '#5a6f7d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, this.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const on = Math.sin(this.blink) > 0;
    ctx.fillStyle = on ? '#ff5d4d' : '#5a2020';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
  }
}

export { Mine };
