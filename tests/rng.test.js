import { describe, it, expect } from 'vitest';
import { makeRng, hashStringToSeed, randIntIn, pickIn } from '../src/systems/rng.js';

describe('seeded rng', () => {
  it('same seed produces an identical sequence', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  it('outputs are in [0,1)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashStringToSeed is stable and order-sensitive', () => {
    expect(hashStringToSeed('2026-06-17')).toBe(hashStringToSeed('2026-06-17'));
    expect(hashStringToSeed('2026-06-17')).not.toBe(hashStringToSeed('2026-06-18'));
  });

  it('randIntIn stays within bounds; pickIn returns a member', () => {
    const r = makeRng(7);
    for (let i = 0; i < 50; i++) {
      const n = randIntIn(r, 3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(pickIn(r, arr));
  });
});
