import { TAU, clamp, lerp, rand, dist, angleTo } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { burst } from '../entities/particles.js';
import { Projectile } from '../entities/projectile.js';

/* ================================ DRONE ================================= */
// Companion drone device: orbits the player and auto-fires at the nearest
// enemy (via the spatial grid). Lifetime-limited like the deployable turret.
class Drone {
  constructor(game, x, y, lifetime) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.radius = 9;
    this.life = lifetime;
    this.maxLife = lifetime;
    this.fireT = 0;
    this.aim = 0;
    this.range = 240;
    this.damage = 7;
    this.orbitA = rand(0, TAU);
    this.dead = false;
  }
  update(dt) {
    const g = this.game,
      p = g.player;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      burst(g, this.x, this.y, '#7adfff', 8, 90, 3, 0.5);
      return;
    }
    // hover beside the player
    this.orbitA += dt * 1.4;
    const tx = p.x + Math.cos(this.orbitA) * 52;
    const ty = p.y + Math.sin(this.orbitA) * 52 - 10;
    this.x = lerp(this.x, tx, clamp(dt * 5, 0, 1));
    this.y = lerp(this.y, ty, clamp(dt * 5, 0, 1));
    // auto-fire nearest enemy
    this.fireT -= dt;
    let target = null,
      bd = Infinity;
    g.enemyGrid.queryCircle(this.x, this.y, this.range + 30, (e) => {
      if (e.dead) return false;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < this.range && d < bd) {
        bd = d;
        target = e;
      }
      return false;
    });
    if (target) {
      this.aim = angleTo(this.x, this.y, target.x, target.y);
      if (this.fireT <= 0) {
        this.fireT = 0.5;
        g.projectiles.push(
          new Projectile(
            this.x + Math.cos(this.aim) * 10,
            this.y + Math.sin(this.aim) * 10,
            this.aim + rand(-0.04, 0.04),
            620,
            this.damage,
            2.2,
            '#7adfff',
            true,
            280
          )
        );
        Sound.blip(700, 0.04, 'square', 0.1, -250);
      }
    }
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    ctx.fillStyle = '#16323e';
    ctx.strokeStyle = '#7adfff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#cfe9ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(this.aim) * 11, y + Math.sin(this.aim) * 11);
    ctx.stroke();
    ctx.fillStyle = 'rgba(122,223,255,0.8)';
    ctx.fillRect(x - 9, y + 11, 18 * clamp(this.life / this.maxLife, 0, 1), 2.5);
  }
}

export { Drone };
