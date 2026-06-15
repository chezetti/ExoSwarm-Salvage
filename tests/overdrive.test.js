import { describe, it, expect } from 'vitest';
import {
  addCharge,
  canActivate,
  activate,
  tickOverdrive,
  isActive,
  OD_DURATION,
} from '../src/systems/overdrive.js';

function makeRun() {
  return { odCharge: 0, odActive: 0 };
}

describe('overdrive', () => {
  it('charges up to but not past 100', () => {
    const r = makeRun();
    addCharge(r, 40);
    addCharge(r, 40);
    expect(r.odCharge).toBe(80);
    addCharge(r, 40);
    expect(r.odCharge).toBe(100);
  });

  it('cannot activate below full, can at full', () => {
    const r = makeRun();
    r.odCharge = 99;
    expect(canActivate(r)).toBe(false);
    expect(activate(r)).toBe(false);
    r.odCharge = 100;
    expect(canActivate(r)).toBe(true);
    expect(activate(r)).toBe(true);
    expect(r.odActive).toBe(OD_DURATION);
    expect(r.odCharge).toBe(0);
  });

  it('does not double-activate while already active', () => {
    const r = makeRun();
    r.odCharge = 100;
    activate(r);
    r.odCharge = 100; // somehow refilled
    expect(canActivate(r)).toBe(false); // still active
  });

  it('does not accumulate charge while active', () => {
    const r = makeRun();
    r.odActive = 3;
    addCharge(r, 50);
    expect(r.odCharge).toBe(0);
  });

  it('drains to zero over its duration and reports inactive', () => {
    const r = makeRun();
    r.odCharge = 100;
    activate(r);
    expect(isActive(r)).toBe(true);
    tickOverdrive(r, OD_DURATION + 1);
    expect(r.odActive).toBe(0);
    expect(isActive(r)).toBe(false);
  });
});
