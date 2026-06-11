import { TAU, rand, dist } from '../core/utils.js';
import { Sound } from '../core/audio.js';
import { burst } from '../entities/particles.js';
import { Turret } from './turret.js';

/* =============================== OUTPOST ================================ */
class Outpost {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.radius = 90;
    this.active = false;
    this.state = 'inactive'; // inactive | active | under_attack
    this.attackT = 0;
    this.pad = { x: x + 70, y: y + 30, r: 46 };
    this.reactor = { x: x - 50, y: y - 30, r: 30 };
    this.repair = { x: x - 30, y: y + 70, r: 44 };
    this.turretSpot = { x: x + 50, y: y - 60 };
    this.turret = null;
    this.spin = 0;
  }
  nearPad(x, y, extra) {
    return dist(x, y, this.pad.x, this.pad.y) < this.pad.r + (extra || 30);
  }
  nearReactor(x, y) {
    return dist(x, y, this.reactor.x, this.reactor.y) < this.reactor.r + 35;
  }
  nearRepair(x, y) {
    return dist(x, y, this.repair.x, this.repair.y) < this.repair.r + 20;
  }
  activate() {
    const g = this.game;
    this.active = true;
    this.state = 'active';
    g.addThreat(1);
    g.run.reactorActivated = true;
    g.run.reactorTimer = 0;
    this.turret = new Turret(g, this.turretSpot.x, this.turretSpot.y, Infinity, true);
    g.turrets.push(this.turret);
    g.toast('Reactor online. Outpost Pale Harbor-Δ is operational. Threat rising!');
    Sound.alarm();
  }
  deliverFromPlayer(player) {
    const g = this.game;
    if (player.carry.length === 0) return;
    let val = 0;
    for (const k of player.carry) {
      val += g.sellPrice(k);
      g.run.delivered[k] = (g.run.delivered[k] || 0) + 1;
    }
    g.run.deliveredValue += val;
    g.toast('Delivered ' + val + ' cr of resources');
    player.carry = [];
    Sound.deliver();
    burst(g, this.pad.x, this.pad.y, '#5dffc8', 14, 120, 4, 0.7);
  }
  deliverFromMule(mule) {
    const g = this.game;
    if (mule.cargo.length === 0) return;
    let val = 0;
    for (const k of mule.cargo) {
      val += g.sellPrice(k);
      g.run.delivered[k] = (g.run.delivered[k] || 0) + 1;
    }
    g.run.deliveredValue += val;
    g.toast('Mule-3 delivered ' + val + ' cr of cargo');
    mule.cargo = [];
    Sound.deliver();
    burst(g, this.pad.x, this.pad.y, '#5dffc8', 14, 120, 4, 0.7);
  }
  takeDamage(dmg) {
    this.attackT = 2;
    if (this.active) this.state = 'under_attack';
    // outpost itself indestructible in prototype, but flashes
    burst(this.game, this.x + rand(-40, 40), this.y + rand(-40, 40), '#ffd35d', 4, 80, 3, 0.4);
  }
  get dead() {
    return false;
  }
  update(dt) {
    this.spin += dt * (this.active ? 2 : 0.3);
    this.attackT = Math.max(0, this.attackT - dt);
    if (this.active && this.attackT <= 0) this.state = 'active';
    // signal regen near outpost handled in Game
  }
  draw(ctx, cam) {
    const x = cam.wx(this.x),
      y = cam.wy(this.y);
    // base plate
    ctx.fillStyle = '#18242c';
    ctx.strokeStyle =
      this.state === 'under_attack' ? '#ff5d4d' : this.active ? '#2ee6a8' : '#3c4c5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + Math.PI / 6;
      const px = x + Math.cos(a) * this.radius,
        py = y + Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cfe2ee';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OUTPOST PALE HARBOR-Δ', x, y - this.radius - 10);
    ctx.textAlign = 'left';

    // cargo pad
    const pad = this.pad;
    const pp = Math.sin(this.spin * 1.5) * 0.5 + 0.5;
    ctx.fillStyle = 'rgba(46,230,168,' + (0.12 + pp * 0.1) + ')';
    ctx.strokeStyle = '#2ee6a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cam.wx(pad.x), cam.wy(pad.y), pad.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(46,230,168,0.5)';
    ctx.beginPath();
    ctx.arc(cam.wx(pad.x), cam.wy(pad.y), pad.r * 0.6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#aef5dc';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CARGO PAD [E]', cam.wx(pad.x), cam.wy(pad.y) + 4);

    // reactor
    const rc = this.reactor;
    const rx = cam.wx(rc.x),
      ry = cam.wy(rc.y);
    ctx.fillStyle = '#22303a';
    ctx.strokeStyle = this.active ? '#7af5ff' : '#5a6f7d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry, rc.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (this.active) {
      ctx.strokeStyle = 'rgba(122,245,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rx, ry, rc.r * 0.6, this.spin, this.spin + Math.PI * 1.2);
      ctx.stroke();
      ctx.fillStyle = '#7af5ff';
      ctx.beginPath();
      ctx.arc(rx, ry, 6 + pp * 3, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#5a6f7d';
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#cfe9ff';
    ctx.fillText(this.active ? 'REACTOR ONLINE' : 'REACTOR OFFLINE [E]', rx, ry - rc.r - 8);

    // repair zone
    const rp = this.repair;
    ctx.strokeStyle = 'rgba(93,255,200,0.55)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cam.wx(rp.x), cam.wy(rp.y), rp.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9fe9cf';
    ctx.fillText('REPAIR', cam.wx(rp.x), cam.wy(rp.y) + 3);
    ctx.textAlign = 'left';
  }
}

export { Outpost };
