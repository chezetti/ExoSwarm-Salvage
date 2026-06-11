import { clamp, lerp, rand } from './utils.js';
import { WORLD_W, WORLD_H } from '../config/data.js';

/* ============================== CAMERA ================================== */
class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.shake = 0;
    this.sx = 0;
    this.sy = 0;
  }
  follow(tx, ty, dt, vw, vh) {
    this.x = lerp(this.x, tx - vw / 2, clamp(dt * 6, 0, 1));
    this.y = lerp(this.y, ty - vh / 2, clamp(dt * 6, 0, 1));
    this.x = clamp(this.x, -200, WORLD_W - vw + 200);
    this.y = clamp(this.y, -200, WORLD_H - vh + 200);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 14);
      this.sx = rand(-1, 1) * this.shake;
      this.sy = rand(-1, 1) * this.shake;
    } else {
      this.sx = 0;
      this.sy = 0;
    }
  }
  addShake(v) {
    this.shake = Math.min(14, this.shake + v);
  }
  wx(x) {
    return x - this.x + this.sx;
  }
  wy(y) {
    return y - this.y + this.sy;
  }
  toWorldX(sx) {
    return sx + this.x - this.sx;
  }
  toWorldY(sy) {
    return sy + this.y - this.sy;
  }
}

export { Camera };
