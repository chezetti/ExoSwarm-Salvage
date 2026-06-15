import { TAU, clamp, rand } from '../core/utils.js';

/* ============================= PARTICLES ================================ */
class Particle {
  constructor(x, y, vx, vy, life, size, color, fade) {
    this.reset(x, y, vx, vy, life, size, color, fade);
  }
  // reset() lets the Particle be recycled from a Pool without re-allocating.
  reset(x, y, vx, vy, life, size, color, fade) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.fade = fade !== false;
    return this;
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
  // Adaptive FX budget: scale the count by the quality setting, and auto-thin
  // when the particle pool is already busy (keeps frame time steady).
  let count = Math.round(n * (game.fxScale != null ? game.fxScale : 1));
  if (game.particles.length > 600) count = Math.floor(count * 0.5);
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU),
      s = rand(speed * 0.3, speed);
    const vx = Math.cos(a) * s,
      vy = Math.sin(a) * s,
      l = rand(life * 0.5, life),
      sz = rand(size * 0.5, size);
    const p = game.particlePool
      ? game.particlePool.acquire(x, y, vx, vy, l, sz, color)
      : new Particle(x, y, vx, vy, l, sz, color);
    game.particles.push(p);
  }
}

export { Particle, burst };
