import { describe, it, expect } from 'vitest';
import { Pool } from '../src/systems/pool.js';

describe('Pool', () => {
  it('uses the factory when empty and resets on acquire', () => {
    let built = 0;
    const pool = new Pool(
      () => {
        built++;
        return { v: 0 };
      },
      (o, v) => {
        o.v = v;
      }
    );
    const a = pool.acquire(5);
    expect(built).toBe(1);
    expect(a.v).toBe(5);
  });

  it('recycles a released instance instead of allocating', () => {
    const pool = new Pool(
      () => ({ v: 0 }),
      (o, v) => {
        o.v = v;
      }
    );
    const a = pool.acquire(1);
    pool.release(a);
    const b = pool.acquire(2);
    expect(b).toBe(a); // same object reused
    expect(b.v).toBe(2); // reset applied
  });

  it('does not grow the free list unbounded under balanced use', () => {
    const pool = new Pool(
      () => ({}),
      () => {}
    );
    const objs = [pool.acquire(), pool.acquire(), pool.acquire()];
    objs.forEach((o) => pool.release(o));
    expect(pool.free.length).toBe(3);
    pool.acquire();
    expect(pool.free.length).toBe(2);
  });
});
