import { TAU, rand } from '../core/utils.js';
import { burst } from '../entities/particles.js';

/* ================================ DECOY ================================== */
// Holographic decoy device: a fragile ghost of the Vanguard clone that
// enemies prefer to target (see Enemy.pickTarget). Dies on timeout or when
// its hp is chewed through.
class Decoy {
  constructor(game, x, y, lifetime) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.radius = 13;
    this.hp = 140;
    this.maxHp = 140;
    this.life = lifetime;
    this.flicker = rand(0, TAU);
    this.dead = false;
  }
  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    burst(this.game, this.x, this.y, '#7af5ff', 14, 140, 3.5, 0.6);
  }
  update(dt) {
    this.life -= dt;
    this.flicker += dt * 14;
    if (this.life <= 0) this.die();
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    const a = 0.45 + Math.sin(this.flicker) * 0.18;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#9fdce8';
    ctx.strokeStyle = '#7af5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, this.radius, this.radius * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export { Decoy };
