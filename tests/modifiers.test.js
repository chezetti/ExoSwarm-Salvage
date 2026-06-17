import { describe, it, expect } from 'vitest';
import { aggregate, MODIFIERS, NEUTRAL } from '../src/config/modifiers.js';

describe('expedition modifiers', () => {
  it('no modifiers → neutral aggregate', () => {
    expect(aggregate([])).toEqual(NEUTRAL);
    expect(aggregate(undefined)).toEqual(NEUTRAL);
  });

  it('multiplies mults and sums adds', () => {
    const a = aggregate(['ironHives', 'richVeins']);
    expect(a.enemyArmorAdd).toBeCloseTo(0.4);
    expect(a.valueMult).toBeCloseTo(1.5);
    expect(a.startThreatAdd).toBe(1);
    expect(a.payoutMult).toBeCloseTo(1.25); // ironHives only contributes payout
  });

  it('combines payout multiplicatively', () => {
    const a = aggregate(['blackout', 'swarmlord']); // 1.3 * 1.3
    expect(a.payoutMult).toBeCloseTo(1.69);
    expect(a.spawnRateMult).toBeCloseTo(1.35);
    expect(a.signalDrainMult).toBeCloseTo(1.6);
  });

  it('clamps payout product to ×3', () => {
    const all = Object.keys(MODIFIERS);
    expect(aggregate(all).payoutMult).toBeLessThanOrEqual(3);
  });

  it('unknown id is a no-op', () => {
    expect(aggregate(['nope'])).toEqual(NEUTRAL);
  });

  it('glass protocol tunes the clone', () => {
    const a = aggregate(['glassClone']);
    expect(a.playerHpMult).toBeCloseTo(0.7);
    expect(a.playerDmgMult).toBeCloseTo(1.4);
  });
});
