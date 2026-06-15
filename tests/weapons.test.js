import { describe, it, expect } from 'vitest';
import { Projectile } from '../src/entities/projectile.js';
import { WORLD_W } from '../src/config/data.js';

// Minimal game stub exposing only what Projectile.update touches.
function gameWithEnemyAt(ex, ey) {
  return {
    enemyGrid: {
      queryCircle(x, y, r, cb) {
        cb({ x: ex, y: ey, dead: false });
      },
    },
  };
}

describe('projectile behaviors', () => {
  it('ricochet reflects off a world bound and decrements the bounce count', () => {
    // moving left (angle PI) from near the left wall, with 2 bounces
    const p = new Projectile(5, 100, Math.PI, 400, 5, 3, '#fff', true, 1000, { bounce: 2 });
    expect(p.vx).toBeLessThan(0);
    p.update(0.1, {}); // crosses x<0 → reflect
    expect(p.vx).toBeGreaterThan(0); // reflected rightward
    expect(p.bounce).toBe(1);
    expect(p.dead).toBe(false);
  });

  it('ricochet dies after its last bounce', () => {
    const p = new Projectile(5, 100, Math.PI, 400, 5, 3, '#fff', true, 1000, { bounce: 1 });
    p.update(0.1, {});
    expect(p.bounce).toBe(0);
    expect(p.dead).toBe(true);
  });

  it('lob/mortar detonates (dead) when its fuse expires', () => {
    const p = new Projectile(100, 100, 0, 400, 5, 3, '#fff', true, 600, {
      lob: true,
      fuse: 0.3,
      aoe: 80,
    });
    p.update(0.1, {});
    expect(p.dead).toBe(false);
    p.update(0.25, {}); // fuse now < 0
    expect(p.dead).toBe(true);
  });

  it('homing steers velocity toward the nearest enemy', () => {
    // launched straight up (-y); enemy is to the right → vx should grow positive
    const p = new Projectile(100, 100, -Math.PI / 2, 400, 5, 3, '#fff', true, 1400, {
      homing: true,
    });
    const before = p.vx;
    p.update(0.1, gameWithEnemyAt(400, 100));
    expect(p.vx).toBeGreaterThan(before); // curved toward the target
    // speed roughly preserved
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(400, -1);
  });

  it('keeps positional ctor args back-compatible (no opts)', () => {
    const p = new Projectile(0, 0, 0, 500, 12, 3, '#fff', true, 700);
    expect(p.bounce).toBe(0);
    expect(p.homing).toBe(0);
    expect(p.lob).toBe(false);
    expect(WORLD_W).toBeGreaterThan(0);
  });
});
