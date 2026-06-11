import { STATUS } from '../config/data.js';
import { burst } from '../entities/particles.js';

/* =============================== STATUS ================================== */
// Status effects on any entity with { x, y, takeDamage, dead }:
//   burn    — damage over time, ticked in chunks (not per frame) so damage
//             numbers and SFX don't spam
//   freeze  — multiplies movement speed via entity.speedMult
//   corrode — reduces armor effectiveness via entity.armorShred (0..1)
//   stun    — near-total slow (EMP)
// applyStatus refreshes duration on re-apply. tickStatuses recomputes
// speedMult/armorShred every call — callers must apply speedMult to their
// movement each frame and never mutate base speed.

function applyStatus(entity, type) {
  const def = STATUS[type];
  if (!def || !entity || entity.dead) return;
  if (!entity.statuses) entity.statuses = {};
  const cur = entity.statuses[type];
  if (cur)
    cur.t = def.dur; // refresh
  else entity.statuses[type] = { t: def.dur, tickT: 0, def };
}

function tickStatuses(entity, dt, game) {
  entity.speedMult = 1;
  entity.armorShred = 0;
  const st = entity.statuses;
  if (!st) return;
  for (const k in st) {
    const s = st[k];
    s.t -= dt;
    if (s.t <= 0) {
      delete st[k];
      continue;
    }
    if (k === 'burn') {
      s.tickT -= dt;
      if (s.tickT <= 0) {
        s.tickT += s.def.tick;
        entity.takeDamage(s.def.dps * s.def.tick, undefined, undefined, 'status');
        if (game) burst(game, entity.x, entity.y, s.def.color, 2, 50, 2, 0.35);
        if (entity.dead) return;
      }
    } else if (k === 'freeze' || k === 'stun') {
      entity.speedMult = Math.min(entity.speedMult, s.def.slow);
      if (game && Math.random() < dt * 4)
        burst(game, entity.x, entity.y, s.def.color, 1, 30, 2, 0.3);
    } else if (k === 'corrode') {
      entity.armorShred = Math.max(entity.armorShred, s.def.armorShred);
      if (game && Math.random() < dt * 3)
        burst(game, entity.x, entity.y, s.def.color, 1, 35, 1.8, 0.3);
    }
  }
}

export { applyStatus, tickStatuses };
