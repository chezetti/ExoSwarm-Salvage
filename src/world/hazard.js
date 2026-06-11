import { TAU, rand, dist } from '../core/utils.js';
import { HAZARDS } from '../config/data.js';
import { burst } from '../entities/particles.js';
import { applyStatus } from '../systems/status.js';
import { Sound } from '../core/audio.js';

/* =============================== HAZARD ================================== */
// Environmental hazard zones, config-driven (see HAZARDS in config/data.js):
//   sporeCloud — applies corrode to anything inside
//   acidPool   — applies burn to anything inside
//   emberVent  — periodic damage pulse
// Hazards affect BOTH enemies (via the spatial grid) and the player.
// life === Infinity for run-long hazards; storm events spawn timed ones.
class Hazard {
  constructor(game, type, x, y, life) {
    this.game = game;
    this.type = type;
    this.def = HAZARDS[type];
    this.x = x;
    this.y = y;
    this.radius = this.def.radius * rand(0.85, 1.2);
    this.life = life || Infinity;
    this.pulse = rand(0, TAU);
    this.tickT = rand(0, 0.4);
    this.ventT = this.def.interval ? rand(0.5, this.def.interval) : 0;
    this.dead = false;
  }
  affect(e) {
    if (this.def.status) applyStatus(e, this.def.status);
  }
  update(dt) {
    const g = this.game;
    this.pulse += dt * 2;
    if (this.life !== Infinity) {
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
    }
    if (this.def.interval) {
      // ember vent: periodic damage burst
      this.ventT -= dt;
      if (this.ventT <= 0) {
        this.ventT = this.def.interval;
        burst(g, this.x, this.y, '#ff9a3d', 10, 140, 3.5, 0.5);
        Sound.blip(90, 0.15, 'sawtooth', 0.18, -30);
        g.enemyGrid.queryCircle(this.x, this.y, this.radius + 30, (e) => {
          if (!e.dead && dist(this.x, this.y, e.x, e.y) < this.radius + e.radius)
            e.takeDamage(this.def.damage, this.x, this.y);
          return false;
        });
        const p = g.player;
        if (!p.dead && dist(this.x, this.y, p.x, p.y) < this.radius + p.radius)
          p.takeDamage(this.def.damage, this.x, this.y);
      }
      return;
    }
    // status zones tick a few times per second (statuses self-refresh)
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.4;
      g.enemyGrid.queryCircle(this.x, this.y, this.radius + 30, (e) => {
        if (!e.dead && dist(this.x, this.y, e.x, e.y) < this.radius + e.radius) this.affect(e);
        return false;
      });
      const p = g.player;
      if (!p.dead && dist(this.x, this.y, p.x, p.y) < this.radius + p.radius) this.affect(p);
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    const p = Math.sin(this.pulse) * 0.5 + 0.5;
    ctx.fillStyle = this.def.color;
    ctx.beginPath();
    ctx.arc(x, y, this.radius + p * 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.def.edge;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(x, y, this.radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export { Hazard };
