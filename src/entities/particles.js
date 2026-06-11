import { TAU, clamp, rand } from '../core/utils.js';

/* ============================= PARTICLES ================================ */
class Particle {
  constructor(x, y, vx, vy, life, size, color, fade) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.fade = fade !== false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 1 - dt * 2;
    this.vy *= 1 - dt * 2;
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
    const a = rand(0, TAU),
      s = rand(speed * 0.3, speed);
    game.particles.push(
      new Particle(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(life * 0.5, life),
        rand(size * 0.5, size),
        color
      )
    );
  }
}

export { Particle, burst };
