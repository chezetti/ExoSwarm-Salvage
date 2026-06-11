import { TAU, clamp, rand, randInt, dist, angleTo, angleDiff, pick } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { burst } from './particles.js';
import { Enemy } from './enemy.js';
import { ResourceNode } from '../world/resource.js';
import { spawnDamageNumber } from './damageNumber.js';

/* ================================ HIVE ================================== */
class Hive {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.level = 1;
    this.maxLevel = 3;
    this.maxHp = 500;
    this.hp = this.maxHp;
    this.radius = 42;
    this.spawnT = rand(2, 5);
    this.growthT = 90;
    this.influence = 280;
    this.weakAngle = rand(0, TAU);
    this.weakDrift = rand(-0.3, 0.3);
    this.destroyed = false;
    this.pulse = rand(0, TAU);
    this.hitFlash = 0;
  }
  spawnInterval() {
    return Math.max(3, 9 - this.level * 2 - this.game.threatLevel() * 0.4);
  }
  update(dt) {
    if (this.destroyed) return;
    const g = this.game;
    this.pulse += dt * (1 + this.level * 0.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.weakAngle += this.weakDrift * dt;
    // growth
    this.growthT -= dt;
    if (this.growthT <= 0 && this.level < this.maxLevel) {
      this.level++;
      this.growthT = 90;
      this.maxHp += 150;
      this.hp += 150;
      this.radius += 7;
      g.toast('Hive grew to level ' + this.level + '!');
      Sound.alarm();
    }
    // spawn
    this.spawnT -= dt;
    const distP = dist(this.x, this.y, g.player.x, g.player.y);
    if (this.spawnT <= 0 && g.enemies.length < 70 && distP < 1400) {
      this.spawnT = this.spawnInterval();
      const pool = ['skitterling'];
      if (this.level >= 2) pool.push('skitterling', 'sporeMantis');
      if (this.level >= 3) pool.push('sporeMantis', 'broodWarden');
      const n = this.level >= 2 ? randInt(1, 2) : 1;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sx = this.x + Math.cos(a) * (this.radius + 20);
        const sy = this.y + Math.sin(a) * (this.radius + 20);
        if (dist(sx, sy, g.player.x, g.player.y) > 180)
          g.enemies.push(
            new Enemy(
              g,
              pick(pool),
              sx,
              sy,
              this.level,
              Math.random() < 0.05 * this.level ? pick(['splitter', 'armored', 'frenzied']) : null
            )
          );
      }
    }
    // signal pressure handled in Game
  }
  takeDamage(dmg, fromX, fromY) {
    if (this.destroyed) return;
    // weak point: hits arriving near weakAngle deal double
    if (fromX !== undefined) {
      const hitA = angleTo(this.x, this.y, fromX, fromY);
      if (Math.abs(angleDiff(this.weakAngle, hitA)) < 0.55) {
        dmg *= 2;
        burst(
          this.game,
          this.x + Math.cos(this.weakAngle) * this.radius,
          this.y + Math.sin(this.weakAngle) * this.radius,
          '#ffe27a',
          5,
          100,
          3,
          0.4
        );
      }
    }
    this.hp -= dmg;
    this.hitFlash = 1;
    Sound.hit();
    spawnDamageNumber(
      this.game,
      this.x,
      this.y - this.radius - 8,
      Math.max(1, Math.round(dmg)),
      dmg >= 40 ? '#ffe27a' : '#ffe9a8',
      dmg >= 40
    );
    if (this.hp <= 0) this.destroy();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const g = this.game;
    g.run.hivesDestroyed++;
    if (this.level >= 3) g.run.maxHiveLevelKilled = 3;
    else g.run.maxHiveLevelKilled = Math.max(g.run.maxHiveLevelKilled, this.level);
    g.addThreat(0.5);
    Sound.hiveDie();
    g.camera.addShake(9);
    burst(g, this.x, this.y, '#ff5d8a', 40, 240, 6, 1.4);
    burst(g, this.x, this.y, '#8aff5d', 20, 160, 4, 1.0);
    // drop enzymes + extras
    const n = 2 + this.level;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU),
        d = rand(20, 70);
      g.resources.push(
        new ResourceNode(g, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 'hiveEnzymes')
      );
    }
    g.toast('Hive destroyed! +' + n + ' Hive Enzymes');
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    if (this.destroyed) {
      ctx.fillStyle = 'rgba(70,40,50,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, this.radius * 0.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,80,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, this.radius * 0.5, 0, TAU);
      ctx.stroke();
      return;
    }
    const p = Math.sin(this.pulse) * 0.5 + 0.5;
    // influence ring (faint)
    ctx.strokeStyle = 'rgba(255,93,138,0.07)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, this.influence, 0, TAU);
    ctx.stroke();
    // tentacles
    ctx.strokeStyle = 'rgba(190,60,100,0.8)';
    ctx.lineWidth = 5;
    const nt = 6 + this.level * 2;
    for (let i = 0; i < nt; i++) {
      const a = i * (TAU / nt) + Math.sin(this.pulse * 0.6 + i) * 0.18;
      const len = this.radius + 16 + Math.sin(this.pulse + i * 1.7) * 7;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * this.radius * 0.7, y + Math.sin(a) * this.radius * 0.7);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.2) * len * 0.8,
        y + Math.sin(a + 0.2) * len * 0.8,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len
      );
      ctx.stroke();
    }
    // body
    const grad = ctx.createRadialGradient(x, y, 4, x, y, this.radius + p * 6);
    grad.addColorStop(0, this.hitFlash > 0 ? '#ffffff' : '#ff7da0');
    grad.addColorStop(0.55, '#a4244f');
    grad.addColorStop(1, '#56132e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, this.radius + p * 4, 0, TAU);
    ctx.fill();
    // pores
    ctx.fillStyle = 'rgba(255,170,200,' + (0.4 + p * 0.4) + ')';
    for (let i = 0; i < 3 + this.level; i++) {
      const a = i * 2.1 + this.pulse * 0.3;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(a) * this.radius * 0.5,
        y + Math.sin(a) * this.radius * 0.5,
        4 + p * 2,
        0,
        TAU
      );
      ctx.fill();
    }
    // weak point
    const wx = x + Math.cos(this.weakAngle) * this.radius;
    const wy = y + Math.sin(this.weakAngle) * this.radius;
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(wx, wy, 6 + p * 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,122,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wx, wy, 10 + p * 3, 0, TAU);
    ctx.stroke();
    // level + hp
    ctx.fillStyle = '#ffd9e6';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HIVE L' + this.level, x, y - this.radius - 16);
    const w = this.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y - this.radius - 12, w, 5);
    ctx.fillStyle = '#ff5d8a';
    ctx.fillRect(x - w / 2, y - this.radius - 12, w * clamp(this.hp / this.maxHp, 0, 1), 5);
    ctx.textAlign = 'left';
  }
}

export { Hive };
