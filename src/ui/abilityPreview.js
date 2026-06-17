import { TAU } from '../core/utils.js';

/* ========================== ABILITY PREVIEW ============================= */
// Tiny looping procedural demo of a class ability, drawn into a (x,y,w,h)
// viewport so players see the effect before choosing. `t` is seconds; each
// demo loops on its own period. Pure Canvas, no assets.
function drawAbilityPreview(ctx, id, x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(4,10,14,0.6)';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2,
    cy = y + h / 2;
  if (id === 'overclock') {
    // player dot firing tracers; cadence surges mid-loop
    const phase = (t % 2) / 2;
    const fast = phase > 0.4 && phase < 0.8;
    if (fast) {
      ctx.fillStyle = 'rgba(255,211,93,0.18)';
      ctx.beginPath();
      ctx.arc(x + 18, cy, 12, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#4df0ff';
    ctx.beginPath();
    ctx.arc(x + 18, cy, 5, 0, TAU);
    ctx.fill();
    const rate = fast ? 70 : 200;
    ctx.strokeStyle = '#ffd35d';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const bx = x + 24 + ((t * 320 + i * rate) % (w - 30));
      ctx.beginPath();
      ctx.moveTo(bx, cy);
      ctx.lineTo(bx + 10, cy);
      ctx.stroke();
    }
  } else if (id === 'blink') {
    // glide, then instant jump with afterimages
    const phase = t % 2;
    let dotX;
    if (phase < 1.2) dotX = x + 16 + (phase / 1.2) * (w * 0.4);
    else {
      dotX = x + w - 22;
      const a = 1 - (phase - 1.2) / 0.8;
      ctx.fillStyle = 'rgba(122,245,255,' + 0.4 * Math.max(0, a) + ')';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 16 + w * 0.4 + i * 12, cy, 5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#7af5ff';
    ctx.beginPath();
    ctx.arc(dotX, cy, 5, 0, TAU);
    ctx.fill();
  } else if (id === 'repairPulse') {
    // expanding heal ring + a mule bar topping up
    const phase = t % 2;
    ctx.strokeStyle = 'rgba(93,255,168,' + Math.max(0, 1 - phase / 1.4) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 20, cy, 6 + phase * 26, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#5dffa8';
    ctx.beginPath();
    ctx.arc(x + 20, cy, 5, 0, TAU);
    ctx.fill();
    // mule hp bar fills with the pulse
    ctx.strokeStyle = '#7da4b3';
    ctx.strokeRect(x + w - 56, cy - 4, 40, 8);
    ctx.fillStyle = '#5dffa8';
    ctx.fillRect(x + w - 55, cy - 3, 38 * Math.min(1, phase / 1.4), 6);
  } else if (id === 'bulwark') {
    // hex shield flashes up; incoming dashes fizzle against it
    const phase = t % 2;
    const sa = phase < 1.4 ? 1 : Math.max(0, 1 - (phase - 1.4) / 0.6);
    ctx.fillStyle = '#7d8cff';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,140,255,' + sa + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU;
      const px = cx + Math.cos(a) * 18,
        py = cy + Math.sin(a) * 18;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#ff7a3d';
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.8 + i / 3) % 1;
      const ix = x + w - 6 - p * (w * 0.5);
      if (ix > cx + 20) {
        ctx.beginPath();
        ctx.moveTo(ix, cy);
        ctx.lineTo(ix + 8, cy);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  // frame
  ctx.strokeStyle = 'rgba(125,164,179,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export { drawAbilityPreview };
