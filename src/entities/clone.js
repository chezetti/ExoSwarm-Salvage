import { TAU } from '../core/utils.js';
import { defaultAppearance } from '../config/appearance.js';

/* =============================== CLONE ================================== */
// Shared procedural renderer for the Vanguard clone silhouette. Used by the
// in-game Player, the customizer preview, and the login/profile avatars so a
// single appearance config drives all three. Draws at (x,y) screen-space.
function drawClone(ctx, x, y, appearance, scale = 1, aim = 0, hitFlash = 0, muzzle = 0) {
  const ap = appearance || defaultAppearance();
  const r = 14 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);
  ctx.fillStyle = hitFlash > 0 ? '#ff9d9d' : ap.body;
  ctx.strokeStyle = '#dff6ff';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  if (ap.shape === 'round') {
    ctx.arc(0, 0, r, 0, TAU);
  } else if (ap.shape === 'wedge') {
    ctx.moveTo(r + 2, 0);
    ctx.lineTo(-r, -r * 0.85);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, r * 0.85);
    ctx.closePath();
  } else {
    // capsule (default)
    ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
  // visor / facing
  ctx.fillStyle = ap.visor;
  ctx.beginPath();
  ctx.moveTo(r + 2, 0);
  ctx.lineTo(r - 7 * scale, -5 * scale);
  ctx.lineTo(r - 7 * scale, 5 * scale);
  ctx.closePath();
  ctx.fill();
  // weapon barrel (accent)
  ctx.strokeStyle = ap.accent;
  ctx.lineWidth = 5 * scale;
  ctx.beginPath();
  ctx.moveTo(4 * scale, 0);
  ctx.lineTo(r + 9 * scale, 0);
  ctx.stroke();
  if (muzzle > 0) {
    ctx.fillStyle = 'rgba(255,255,200,' + muzzle * 0.8 + ')';
    ctx.beginPath();
    ctx.arc(r + 10 * scale, 0, 5 * scale * muzzle, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export { drawClone };
