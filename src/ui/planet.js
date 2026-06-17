import { TAU } from '../core/utils.js';

/* =============================== PLANET ================================= */
// Morrow Fen — a "living", contested bioluminescent swamp world for the menu.
//
// Seam-free by construction: the surface is a cloud of soft blobs placed in
// SPHERICAL coords (lon/lat). Every frame longitude rotates and each blob is
// projected onto the disc like a real globe (foreshorten + fade near the limb,
// skipped on the far side, re-emerges later). No texture tiles → no seams.
//
// On top of that, a living scene: night-side settlement lights, flaring
// firefights and explosions on the surface, a drifting aurora, and a lone
// patrol ship in orbit that ducks behind the planet. All procedural, additive.

function softSprite(size, rgb, sharp) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  if (sharp) {
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.25, 'rgba(' + rgb + ',0.55)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
  } else {
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.6, 'rgba(' + rgb + ',0.55)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function makeLayer(n, sprite, opt) {
  const blobs = [];
  for (let i = 0; i < n; i++) {
    blobs.push({
      lon: Math.random() * TAU,
      lat: (Math.random() * 2 - 1) * 1.25,
      size: opt.size[0] + Math.random() * (opt.size[1] - opt.size[0]),
      alpha: opt.alpha[0] + Math.random() * (opt.alpha[1] - opt.alpha[0]),
      ph: Math.random() * TAU,
    });
  }
  return {
    sprite,
    blobs,
    spin: opt.spin,
    pulse: !!opt.pulse,
    drift: opt.drift || 0,
    add: !!opt.add,
  };
}

// Light direction (upper-left, slightly toward viewer) in normal space:
// x = right, y = up-on-screen (negative screen-y), z = toward viewer.
const L = (() => {
  const v = [-0.5, 0.55, 0.66];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();

class Planet {
  constructor(r) {
    this.r = r;
    this.t = 0;
    this.bob = 0;
    this.spin = 0.05; // base surface rotation (rad/s)
    const sp = Math.max(16, Math.round(r * 0.9));
    const dark = softSprite(sp, '9,52,36');
    const light = softSprite(sp, '88,224,162');
    const cloud = softSprite(sp, '200,255,232');
    const glow = softSprite(sp, '120,255,120');
    this.spCity = softSprite(Math.max(8, Math.round(r * 0.12)), '255,214,140', true);
    this.spFlash = softSprite(Math.max(8, Math.round(r * 0.16)), '255,236,180', true);
    this.spBoom = softSprite(Math.max(12, Math.round(r * 0.5)), '255,150,70');
    this.spCore = softSprite(Math.max(10, Math.round(r * 0.3)), '255,250,235', true);
    this.layers = [
      makeLayer(20, dark, { size: [0.14, 0.34], alpha: [0.2, 0.36], spin: 0.05 }), // continents
      makeLayer(20, light, { size: [0.08, 0.2], alpha: [0.12, 0.22], spin: 0.05 }), // highlands
      makeLayer(10, cloud, { size: [0.1, 0.24], alpha: [0.04, 0.09], spin: 0.08 }), // weather
      makeLayer(9, glow, {
        size: [0.06, 0.14],
        alpha: [0.22, 0.45],
        spin: 0.04,
        pulse: true,
        drift: 0.15,
        add: true,
      }),
    ];
    // night-side settlements (fixed on the surface, rotate with the world)
    this.cities = [];
    for (let i = 0; i < 22; i++) {
      this.cities.push({
        lon: Math.random() * TAU,
        lat: (Math.random() * 2 - 1) * 1.1,
        s: 0.5 + Math.random() * 0.9,
        ph: Math.random() * TAU,
      });
    }
    // combat events flaring up across the surface
    this.events = [];
    this.spawnT = 0.6;
    // lone patrol ship on a tilted orbit
    this.orbit = { a: Math.random() * TAU, speed: 0.5, tilt: 0.34, rad: r * 1.16, trail: [] };
  }

  _spawnEvent() {
    // bias toward the night side (more dramatic) by rejection sampling a few tries
    let best = null,
      bestNight = -1;
    for (let k = 0; k < 4; k++) {
      const lon = Math.random() * TAU,
        lat = (Math.random() * 2 - 1) * 1.1;
      const cl = Math.cos(lat);
      const n = [cl * Math.sin(lon), -Math.sin(lat), cl * Math.cos(lon)];
      const day = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const night = 1 - day;
      if (night > bestNight) {
        bestNight = night;
        best = { lon, lat };
      }
    }
    const explosion = Math.random() < 0.4;
    this.events.push({
      lon: best.lon,
      lat: best.lat,
      kind: explosion ? 'boom' : 'fire',
      t: 0,
      life: explosion ? 1.1 : 1.2 + Math.random() * 1.1,
      seed: Math.random() * 1000,
    });
  }

  update(dt, reduced) {
    if (reduced) {
      this.bob = 0;
      return;
    }
    this.t += dt;
    this.bob = Math.sin(this.t * 0.6) * 3;
    // orbit
    this.orbit.a += this.orbit.speed * dt;
    // combat scheduler (cap concurrent events)
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.events.length < 3) {
      this.spawnT = 1.0 + Math.random() * 2.0;
      this._spawnEvent();
    }
    for (const e of this.events) e.t += dt;
    this.events = this.events.filter((e) => e.t < e.life);
  }

  // project lon/lat onto the disc; returns null if on the far hemisphere
  _project(lon, lat, cx, y) {
    const cl = Math.cos(lat),
      sl = Math.sin(lat);
    const nx = cl * Math.sin(lon),
      ny = -sl,
      nz = cl * Math.cos(lon);
    if (nz <= 0.02) return null;
    const day = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    return {
      sx: cx + this.r * nx,
      sy: y + this.r * ny,
      depth: nz,
      fade: smoothstep(0.02, 0.32, nz),
      night: 1 - day,
    };
  }

  _drawLayer(ctx, layer, cx, y) {
    const img = layer.sprite;
    if (!img) return;
    if (layer.add) ctx.globalCompositeOperation = 'lighter';
    for (const b of layer.blobs) {
      const lon =
        b.lon +
        this.t * layer.spin +
        (layer.drift ? Math.sin(this.t * 0.3 + b.ph) * layer.drift : 0);
      const p = this._project(lon, b.lat, cx, y);
      if (!p) continue;
      const scale = 0.55 + 0.45 * p.depth;
      const s = b.size * this.r * scale;
      let a = b.alpha * p.fade;
      if (layer.pulse) a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * 1.3 + b.ph));
      if (a <= 0.002) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(img, p.sx - s, p.sy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    if (layer.add) ctx.globalCompositeOperation = 'source-over';
  }

  _drawCities(ctx, cx, y, reduced) {
    if (!this.spCity) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.cities) {
      const lon = c.lon + this.t * this.spin;
      const p = this._project(lon, c.lat, cx, y);
      if (!p) continue;
      const tw = reduced ? 0.7 : 0.6 + 0.4 * Math.sin(this.t * 3 + c.ph);
      const a = p.night * p.fade * tw * 0.9; // only glow on the dark side
      if (a <= 0.01) continue;
      const s = c.s * this.r * 0.05 * (0.6 + 0.4 * p.depth);
      ctx.globalAlpha = a;
      ctx.drawImage(this.spCity, p.sx - s, p.sy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawEvents(ctx, cx, y) {
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.events) {
      const lon = e.lon + this.t * this.spin;
      const p = this._project(lon, e.lat, cx, y);
      if (!p) continue;
      const k = e.t / e.life; // 0..1
      if (e.kind === 'fire') {
        // firefight: a tight cluster of rapid muzzle flashes
        const env = Math.sin(Math.min(1, k * 3.2) * Math.PI) * (1 - smoothstep(0.7, 1, k));
        const n = 4;
        for (let i = 0; i < n; i++) {
          const fl = Math.random(); // per-frame flicker
          if (fl < 0.45) continue;
          const ang = e.seed + i * 2.1;
          const rad = this.r * 0.05 * (0.4 + (i % 3) * 0.5);
          const fx = p.sx + Math.cos(ang) * rad,
            fy = p.sy + Math.sin(ang) * rad;
          const s = this.r * (0.018 + fl * 0.03) * (0.6 + 0.4 * p.depth);
          ctx.globalAlpha = Math.min(1, env * fl) * 0.95 * p.fade;
          ctx.drawImage(this.spFlash, fx - s, fy - s, s * 2, s * 2);
        }
      } else {
        // explosion: white core flash + expanding shockwave ring + orange afterglow
        const grow = smoothstep(0, 0.5, k);
        const fadeOut = 1 - smoothstep(0.25, 1, k);
        // afterglow
        const gs = this.r * (0.06 + grow * 0.16) * (0.6 + 0.4 * p.depth);
        ctx.globalAlpha = 0.7 * fadeOut * p.fade;
        ctx.drawImage(this.spBoom, p.sx - gs, p.sy - gs, gs * 2, gs * 2);
        // core (brightest at start)
        const coreA = (1 - smoothstep(0, 0.22, k)) * p.fade;
        if (coreA > 0.01) {
          const cs = this.r * 0.07 * (1 - k * 0.5) * (0.6 + 0.4 * p.depth);
          ctx.globalAlpha = coreA;
          ctx.drawImage(this.spCore, p.sx - cs, p.sy - cs, cs * 2, cs * 2);
        }
        // shockwave ring
        const rw = this.r * (0.04 + k * 0.22) * (0.6 + 0.4 * p.depth);
        const ringA = (1 - smoothstep(0.1, 0.95, k)) * 0.6 * p.fade;
        if (ringA > 0.01) {
          ctx.globalAlpha = ringA;
          ctx.strokeStyle = 'rgba(255,180,110,1)';
          ctx.lineWidth = Math.max(1, this.r * 0.01 * (1 - k));
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, rw, 0, TAU);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawAurora(ctx, cx, y, reduced) {
    // shimmering band near the north pole; hue drifts slowly
    ctx.globalCompositeOperation = 'lighter';
    const bands = 3;
    for (let i = 0; i < bands; i++) {
      const ph = this.t * (reduced ? 0 : 0.5) + i * 1.7;
      const a = (0.05 + 0.05 * (0.5 + 0.5 * Math.sin(ph))) * (1 - i * 0.22);
      const hueShift = Math.sin(ph * 0.7);
      const col = hueShift > 0 ? '120,255,200' : '120,210,255';
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(' + col + ',1)';
      ctx.lineWidth = this.r * (0.05 + i * 0.02);
      ctx.beginPath();
      const rr = this.r * (0.62 + i * 0.07);
      const yy = y - this.r * (0.42 + i * 0.05);
      ctx.ellipse(
        cx - this.r * 0.05,
        yy,
        rr,
        rr * 0.32,
        Math.sin(ph * 0.3) * 0.15,
        Math.PI * 1.05,
        Math.PI * 1.95
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawOrbiter(ctx, cx, y) {
    const o = this.orbit;
    const ox = cx + Math.cos(o.a) * o.rad;
    const oy = y + Math.sin(o.a) * o.rad * o.tilt;
    // behind the planet on the far half of the orbit when overlapping the disc
    const behind = Math.sin(o.a) < 0;
    const insideDisc = Math.hypot(ox - cx, oy - y) < this.r - 2;
    if (behind && insideDisc) return; // occluded
    // short fading trail
    o.trail.push({ x: ox, y: oy });
    if (o.trail.length > 10) o.trail.shift();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < o.trail.length; i++) {
      const tp = o.trail[i];
      ctx.globalAlpha = (i / o.trail.length) * 0.25;
      ctx.fillStyle = 'rgba(130,245,255,1)';
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 1.6, 0, TAU);
      ctx.fill();
    }
    // ship glint
    ctx.globalAlpha = 0.9;
    const gl = ctx.createRadialGradient(ox, oy, 0, ox, oy, 6);
    gl.addColorStop(0, 'rgba(200,250,255,0.9)');
    gl.addColorStop(1, 'rgba(120,240,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(ox, oy, 6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(ctx, cx, cy, reduced) {
    const r = this.r,
      y = cy + this.bob;
    // 1. atmosphere halo
    const halo = ctx.createRadialGradient(cx, y, r * 0.82, cx, y, r * 1.28);
    halo.addColorStop(0, 'rgba(77,240,255,0.2)');
    halo.addColorStop(1, 'rgba(77,240,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, y, r * 1.28, 0, TAU);
    ctx.fill();
    // clip to the sphere
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, TAU);
    ctx.clip();
    // 2. base sphere (limb darkening, lit upper-left)
    const base = ctx.createRadialGradient(cx - r * 0.35, y - r * 0.35, r * 0.1, cx, y, r);
    base.addColorStop(0, '#236b54');
    base.addColorStop(1, '#06140f');
    ctx.fillStyle = base;
    ctx.fillRect(cx - r, y - r, r * 2, r * 2);
    // 3. rotating surface (continents, highlands, weather, veins)
    for (const layer of this.layers) this._drawLayer(ctx, layer, cx, y);
    // 4. terminator (day/night) — concentric (nested circles → no cone artifact)
    const lx = cx - r * 0.45,
      ly = y - r * 0.45;
    const term = ctx.createRadialGradient(lx, ly, r * 0.25, lx, ly, r * 2.05);
    term.addColorStop(0, 'rgba(0,0,0,0)');
    term.addColorStop(0.62, 'rgba(0,0,0,0)');
    term.addColorStop(1, 'rgba(2,8,6,0.55)');
    ctx.fillStyle = term;
    ctx.fillRect(cx - r, y - r, r * 2, r * 2);
    // 5. living scene on the surface (over the night shading)
    this._drawCities(ctx, cx, y, reduced);
    this._drawAurora(ctx, cx, y, reduced);
    this._drawEvents(ctx, cx, y);
    ctx.restore();
    // 6. limb highlight (Fresnel) — soft inset arc on the lit edge
    ctx.strokeStyle = 'rgba(150,255,220,0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, y, r - 1.5, Math.PI * 0.95, Math.PI * 1.5);
    ctx.stroke();
    // 7. specular sheen near the light pole
    const gx = cx - r * 0.42,
      gy = y - r * 0.42;
    const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.32);
    gl.addColorStop(0, 'rgba(220,255,245,0.16)');
    gl.addColorStop(1, 'rgba(220,255,245,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(gx, gy, r * 0.32, 0, TAU);
    ctx.fill();
    // 8. lone patrol ship in orbit (ducks behind the planet)
    this._drawOrbiter(ctx, cx, y);
  }
}

export { Planet };
