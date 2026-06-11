import { clamp } from '../core/utils.js';

/* =========================== DAMAGE NUMBERS ============================= */
// Floating combat text. Mirrors the Particle lifecycle: update(dt) returns
// false when expired and Game filters the array each frame. Spawns are
// capped and culled off-screen to protect the frame budget.
const MAX_DAMAGE_NUMBERS = 60;

class DamageNumber {
  constructor(x, y, text, color, big) {
    this.x = x;
    this.y = y;
    this.vy = big ? -70 : -50;
    this.life = big ? 0.9 : 0.65;
    this.maxLife = this.life;
    this.text = String(text);
    this.color = color || '#ffe9a8';
    this.big = !!big;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 1 - dt * 2.5;
    this.life -= dt;
    return this.life > 0;
  }
  draw(ctx, cam) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.font = this.big ? 'bold 15px monospace' : 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, cam.wx(this.x), cam.wy(this.y));
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

function spawnDamageNumber(game, x, y, text, color, big) {
  if (game.damageNumbers.length >= MAX_DAMAGE_NUMBERS) return;
  const sx = game.camera.wx(x),
    sy = game.camera.wy(y);
  if (sx < -20 || sy < -20 || sx > game.canvas.width + 20 || sy > game.canvas.height + 20) return;
  game.damageNumbers.push(new DamageNumber(x, y, text, color, big));
}

export { DamageNumber, spawnDamageNumber };
