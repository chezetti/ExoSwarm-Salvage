import { TAU } from '../core/utils.js';

/* =============================== ICONS ================================== */
// Procedural weapon/device icons drawn with Canvas shapes (no image assets).
// drawIcon(ctx, key, cx, cy, size, color) renders centered in a size box.
// One visual language shared by the station loadout and the in-run HUD.
function drawIcon(ctx, key, cx, cy, size, color) {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (key) {
    case 'pulse': // barrel + 3 impulse dots
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(s * 0.1, 0);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(s * 0.4 + i * s * 0.3, 0, s * 0.1, 0, TAU);
        ctx.fill();
      }
      break;
    case 'shotgun': // muzzle + 3-pellet spread
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(-s * 0.1, 0);
      ctx.stroke();
      for (const a of [-0.4, 0, 0.4]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8);
        ctx.stroke();
      }
      break;
    case 'arc': // lightning zigzag
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.4);
      ctx.lineTo(-s * 0.1, s * 0.1);
      ctx.lineTo(s * 0.2, -s * 0.3);
      ctx.lineTo(s * 0.7, s * 0.4);
      ctx.stroke();
      break;
    case 'railgun': // long thin line + charge head
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0);
      ctx.lineTo(s * 0.5, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.5, -s * 0.35);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(s * 0.5, s * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    case 'flak': // shell + burst ring
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.28, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
        ctx.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8);
        ctx.stroke();
      }
      break;
    case 'homingLauncher': // 3 pods with trails
      for (const d of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.arc(s * 0.3, d * s, s * 0.14, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.16, d * s);
        ctx.lineTo(-s * 0.7, d * s * 0.6);
        ctx.stroke();
      }
      break;
    case 'ricochet': // bouncing path
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, s * 0.4);
      ctx.lineTo(-s * 0.2, -s * 0.4);
      ctx.lineTo(s * 0.3, s * 0.4);
      ctx.lineTo(s * 0.8, -s * 0.2);
      ctx.stroke();
      break;
    case 'cryoMortar': { // shell + snowflake
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
        ctx.stroke();
      }
      break;
    }
    case 'chargeBeam': // node + charging arrow
      ctx.beginPath();
      ctx.arc(-s * 0.5, 0, s * 0.18, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.6, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.3);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(s * 0.3, s * 0.3);
      ctx.stroke();
      break;
    case 'turret': // base + short barrel
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.4);
      ctx.lineTo(s * 0.5, s * 0.4);
      ctx.lineTo(s * 0.3, -s * 0.1);
      ctx.lineTo(-s * 0.3, -s * 0.1);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.6, -s * 0.4);
      ctx.stroke();
      break;
    case 'shield': // hex shield
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        const px = Math.cos(a) * s * 0.6,
          py = Math.sin(a) * s * 0.6;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    case 'scanner': // radar arcs
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(0, s * 0.3, s * 0.25 * i, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, s * 0.3, s * 0.06, 0, TAU);
      ctx.fill();
      break;
    case 'mine': // spiked circle
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.32, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.32);
        ctx.lineTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
        ctx.stroke();
      }
      break;
    case 'drone': // triangle body + rotor dashes
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(s * 0.4, s * 0.3);
      ctx.lineTo(-s * 0.4, s * 0.3);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.3);
      ctx.lineTo(-s * 0.2, -s * 0.3);
      ctx.moveTo(s * 0.2, -s * 0.3);
      ctx.lineTo(s * 0.7, -s * 0.3);
      ctx.stroke();
      break;
    case 'decoy': // dashed clone silhouette
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.4, s * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'emp': // ring + radial discharges
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.35, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
        ctx.lineTo(Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.75);
        ctx.stroke();
      }
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, TAU);
      ctx.stroke();
  }
  ctx.restore();
}

// Token color by effect family for a consistent icon language.
function iconColor(def) {
  if (!def) return '#d8f4ff';
  if (def.status === 'freeze' || def.key === 'scanner') return '#9adfff';
  if (def.useHeat || def.key === 'arc' || def.key === 'chargeBeam' || def.key === 'emp')
    return '#4df0ff';
  if (def.aoe || def.status) return '#8aff5d';
  if (def.key === 'shield' || def.key === 'decoy') return '#7d8cff';
  return '#d8f4ff';
}

export { drawIcon, iconColor };
