import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/systems/spatialGrid.js';

function collect(grid, x, y, r) {
  const out = [];
  grid.queryCircle(x, y, r, (e) => {
    out.push(e);
    return false;
  });
  return out;
}

describe('SpatialGrid', () => {
  it('returns a superset of all in-radius points and nothing outside padded cells', () => {
    const grid = new SpatialGrid(128);
    const pts = [];
    // deterministic pseudo-random points
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 100; i++) pts.push({ x: rnd() * 3000, y: rnd() * 3000, id: i });
    for (const p of pts) grid.insert(p);

    const qx = 1500,
      qy = 1500,
      r = 300;
    const found = collect(grid, qx, qy, r);
    const inRadius = pts.filter((p) => Math.hypot(p.x - qx, p.y - qy) <= r);
    // every truly in-radius point must be among candidates
    for (const p of inRadius) expect(found).toContain(p);
    // candidates only come from overlapping cells (within r + cell size)
    for (const p of found) {
      expect(Math.abs(p.x - qx)).toBeLessThanOrEqual(r + 128);
      expect(Math.abs(p.y - qy)).toBeLessThanOrEqual(r + 128);
    }
  });

  it('finds a point exactly on the radius boundary', () => {
    const grid = new SpatialGrid(128);
    const p = { x: 100 + 50, y: 100 };
    grid.insert(p);
    const found = collect(grid, 100, 100, 50);
    expect(found).toContain(p);
  });

  it('returns nothing from empty regions and after clear()', () => {
    const grid = new SpatialGrid(128);
    expect(collect(grid, 500, 500, 200)).toEqual([]);
    const p = { x: 500, y: 500 };
    grid.insert(p);
    expect(collect(grid, 500, 500, 10)).toContain(p);
    grid.clear();
    expect(collect(grid, 500, 500, 200)).toEqual([]);
  });

  it('rebuild (clear + insert) leaves no stale entries and reuses cells', () => {
    const grid = new SpatialGrid(128);
    const a = { x: 10, y: 10 };
    const b = { x: 12, y: 14 };
    grid.insert(a);
    const cellCount = grid.cells.size;
    grid.clear();
    grid.insert(b);
    expect(grid.cells.size).toBe(cellCount); // same cell reused, no growth
    const found = collect(grid, 10, 10, 30);
    expect(found).toContain(b);
    expect(found).not.toContain(a);
  });

  it('stops iteration early when the callback returns true', () => {
    const grid = new SpatialGrid(128);
    for (let i = 0; i < 10; i++) grid.insert({ x: 50 + i, y: 50 });
    let calls = 0;
    grid.queryCircle(55, 50, 40, () => {
      calls++;
      return true;
    });
    expect(calls).toBe(1);
  });
});
