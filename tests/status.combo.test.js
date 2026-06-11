import { describe, it, expect } from 'vitest';
import { registerKill, tickCombo, COMBO_WINDOW } from '../src/systems/combo.js';
import { applyStatus, tickStatuses } from '../src/systems/status.js';
import { STATUS } from '../src/config/data.js';

function makeRun() {
  return { combo: 0, comboT: 0, comboMult: 1 };
}

function makeEntity() {
  return {
    x: 0,
    y: 0,
    hp: 100,
    dead: false,
    takeDamage(d) {
      this.hp -= d;
      if (this.hp <= 0) this.dead = true;
    },
  };
}

describe('combo', () => {
  it('multiplier curve: 1x at 0-4 kills, 1.5x at 5, 2x at 10, capped at 3.5x', () => {
    const run = makeRun();
    for (let i = 0; i < 4; i++) registerKill(run);
    expect(run.comboMult).toBe(1);
    registerKill(run); // 5
    expect(run.comboMult).toBe(1.5);
    for (let i = 0; i < 5; i++) registerKill(run); // 10
    expect(run.comboMult).toBe(2);
    for (let i = 0; i < 90; i++) registerKill(run); // way past cap
    expect(run.comboMult).toBe(3.5);
  });

  it('decays to zero after the window and resets the multiplier', () => {
    const run = makeRun();
    for (let i = 0; i < 10; i++) registerKill(run);
    expect(run.combo).toBe(10);
    tickCombo(run, COMBO_WINDOW + 0.01);
    expect(run.combo).toBe(0);
    expect(run.comboMult).toBe(1);
  });

  it('a kill refreshes the decay window', () => {
    const run = makeRun();
    registerKill(run);
    tickCombo(run, COMBO_WINDOW - 0.5);
    registerKill(run);
    tickCombo(run, COMBO_WINDOW - 0.5);
    expect(run.combo).toBe(2); // still alive — window was refreshed
  });
});

describe('status', () => {
  it('burn deals ~dps*dur total damage over its duration', () => {
    const e = makeEntity();
    applyStatus(e, 'burn');
    const expected = STATUS.burn.dps * STATUS.burn.dur;
    for (let t = 0; t < STATUS.burn.dur + 0.5; t += 0.05) tickStatuses(e, 0.05, null);
    expect(100 - e.hp).toBeGreaterThanOrEqual(expected * 0.85);
    expect(100 - e.hp).toBeLessThanOrEqual(expected * 1.15);
  });

  it('burn can kill mid-tick and stops afterwards', () => {
    const e = makeEntity();
    e.hp = 3;
    applyStatus(e, 'burn');
    for (let i = 0; i < 40 && !e.dead; i++) tickStatuses(e, 0.1, null);
    expect(e.dead).toBe(true);
  });

  it('freeze sets speedMult while active and restores to 1 after expiry', () => {
    const e = makeEntity();
    applyStatus(e, 'freeze');
    tickStatuses(e, 0.1, null);
    expect(e.speedMult).toBe(STATUS.freeze.slow);
    tickStatuses(e, STATUS.freeze.dur + 1, null);
    expect(e.speedMult).toBe(1);
  });

  it('re-applying refreshes duration instead of stacking', () => {
    const e = makeEntity();
    applyStatus(e, 'freeze');
    tickStatuses(e, STATUS.freeze.dur - 0.1, null);
    applyStatus(e, 'freeze'); // refresh just before expiry
    tickStatuses(e, STATUS.freeze.dur - 0.1, null);
    expect(e.speedMult).toBe(STATUS.freeze.slow); // still frozen
  });

  it('corrode exposes armorShred; unknown status is a no-op', () => {
    const e = makeEntity();
    applyStatus(e, 'corrode');
    tickStatuses(e, 0.1, null);
    expect(e.armorShred).toBe(STATUS.corrode.armorShred);
    applyStatus(e, 'nonexistent');
    expect(e.statuses.nonexistent).toBeUndefined();
  });
});
