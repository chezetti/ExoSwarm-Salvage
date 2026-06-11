import { TAU, rand } from '../core/utils.js';
import { RESOURCE_TYPES } from '../config/data.js';

/* ============================ RESOURCE NODE ============================= */
class ResourceNode {
  constructor(game, x, y, type) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type;
    this.dead = false;
    this.bob = rand(0, TAU);
    this.radius = 9 + RESOURCE_TYPES[type].weight;
  }
  weightHeavy() {
    return RESOURCE_TYPES[this.type].weight >= 3;
  }
  update(dt) {
    this.bob += dt * 2.4;
  }
  draw(ctx, cam, revealed) {
    const def = RESOURCE_TYPES[this.type];
    const x = cam.wx(this.x),
      y = cam.wy(this.y) + Math.sin(this.bob) * 2;
    const p = Math.sin(this.bob) * 0.5 + 0.5;
    ctx.fillStyle = def.glow + (0.1 + p * 0.1) + ')';
    ctx.beginPath();
    ctx.arc(x, y, this.radius + 9, 0, TAU);
    ctx.fill();
    // crystal diamond
    ctx.fillStyle = def.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    const r = this.radius;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    if (this.weightHeavy()) {
      ctx.fillStyle = '#cfe9ff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY', x, y + r + 11);
      ctx.textAlign = 'left';
    }
    if (revealed) {
      ctx.strokeStyle = def.glow + '0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 13 + p * 3, 0, TAU);
      ctx.stroke();
    }
  }
}

export { ResourceNode };
