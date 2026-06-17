import { TAU } from '../core/utils.js';

/* =============================== PLANET ================================= */
// Morrow Fen — a "living" bioluminescent swamp planet for the station/menu.
// Layered + procedural (no assets): the expensive surface noise is baked ONCE
// into an offscreen canvas at construction and only scrolled per-frame; cheap
// layers (veins pulse, bob) animate live. Reusable on death/victory too.
function valueNoiseTile(w, h, cells, tint) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;
  // coarse random grid, smoothed by drawing soft radial blobs — cheap, one-time
  const gx = cells,
    gy = Math.max(2, Math.round((cells * h) / w));
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const v = Math.random();
      const r = (w / gx) * (0.7 + v);
      const cx = (i / gx) * w + Math.random() * (w / gx);
      const cy = (j / gy) * h + Math.random() * (h / gy);
      const a = 0.05 + v * 0.18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, tint + a + ')');
      g.addColorStop(1, tint + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  return cv;
}

class Planet {
  constructor(r) {
    this.r = r;
    this.t = 0;
    this.bob = 0;
    // bake surface + cloud tiles once (width 2r so it tiles around the sphere)
    const w = Math.round(r * 2),
      h = Math.round(r * 2);
    this.surface = valueNoiseTile(w, h, 7, 'rgba(60,200,150,');
    this.clouds = valueNoiseTile(w, h, 4, 'rgba(170,255,210,');
    // organic bioluminescent veins (closed blobs) with their own pulse phase
    this.veins = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.random();
      const d = r * (0.2 + Math.random() * 0.5);
      this.veins.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        s: r * (0.18 + Math.random() * 0.22),
        ph: Math.random() * TAU,
        drift: (Math.random() - 0.5) * 0.2,
      });
    }
  }
  update(dt, reduced) {
    this.t += reduced ? 0 : dt;
    this.bob = reduced ? 0 : Math.sin(this.t * 0.6) * 3;
  }
  draw(ctx, cx, cy, reduced) {
    const r = this.r,
      y = cy + this.bob;
    // 1. atmosphere halo
    const halo = ctx.createRadialGradient(cx, y, r * 0.85, cx, y, r * 1.25);
    halo.addColorStop(0, 'rgba(77,240,255,0.18)');
    halo.addColorStop(1, 'rgba(77,240,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, y, r * 1.25, 0, TAU);
    ctx.fill();
    // clip everything else to the sphere
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, TAU);
    ctx.clip();
    // 2. base sphere with limb darkening (light from upper-left)
    const base = ctx.createRadialGradient(cx - r * 0.35, y - r * 0.35, r * 0.1, cx, y, r);
    base.addColorStop(0, '#1d5f4a');
    base.addColorStop(1, '#06140f');
    ctx.fillStyle = base;
    ctx.fillRect(cx - r, y - r, r * 2, r * 2);
    // 3. rotating surface (scroll the baked tile horizontally), 4. faster clouds
    const sw = r * 2;
    if (this.surface) {
      const off = (this.t * 12) % sw;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.surface, cx - r - off, y - r);
      ctx.drawImage(this.surface, cx - r - off + sw, y - r);
    }
    if (this.clouds) {
      const off2 = (this.t * 22) % sw;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.clouds, cx - r - off2, y - r);
      ctx.drawImage(this.clouds, cx - r - off2 + sw, y - r);
    }
    ctx.globalAlpha = 1;
    // 5. bioluminescent veins — pulse + slow drift (the "living" signal)
    for (const v of this.veins) {
      const pulse = reduced ? 0.4 : 0.5 + 0.5 * Math.sin(this.t * 1.3 + v.ph);
      const vx = cx + v.x + Math.sin(this.t * 0.3 + v.ph) * v.drift * r;
      const vy = y + v.y;
      const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, v.s);
      g.addColorStop(0, 'rgba(138,255,93,' + (0.12 + pulse * 0.33) + ')');
      g.addColorStop(1, 'rgba(138,255,93,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vx, vy, v.s, 0, TAU);
      ctx.fill();
    }
    // 6. terminator (day/night) — darken toward lower-right
    const term = ctx.createRadialGradient(
      cx - r * 0.4,
      y - r * 0.4,
      r * 0.4,
      cx + r * 0.5,
      y + r * 0.5,
      r * 1.4
    );
    term.addColorStop(0, 'rgba(0,0,0,0)');
    term.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = term;
    ctx.fillRect(cx - r, y - r, r * 2, r * 2);
    ctx.restore();
    // 7. limb highlight (Fresnel) on the upper-left edge
    ctx.strokeStyle = 'rgba(150,255,220,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y, r - 1, Math.PI * 0.9, Math.PI * 1.55);
    ctx.stroke();
    // 8. specular glint near the light pole
    const gl = ctx.createRadialGradient(
      cx - r * 0.4,
      y - r * 0.4,
      0,
      cx - r * 0.4,
      y - r * 0.4,
      r * 0.3
    );
    gl.addColorStop(0, 'rgba(220,255,245,0.35)');
    gl.addColorStop(1, 'rgba(220,255,245,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, y - r * 0.4, r * 0.3, 0, TAU);
    ctx.fill();
  }
}

export { Planet };
