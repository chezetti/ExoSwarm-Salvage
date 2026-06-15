import { describe, it, expect } from 'vitest';
import { sha256hex, verify, createProfile, cryptoAvailable } from '../src/systems/profiles.js';

describe('profiles', () => {
  it('sha256hex is deterministic for the same salt+password', async () => {
    if (!cryptoAvailable()) return; // skip where Web Crypto is unavailable
    const a = await sha256hex('salt123', 'hunter2');
    const b = await sha256hex('salt123', 'hunter2');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different salt yields a different hash', async () => {
    if (!cryptoAvailable()) return;
    const a = await sha256hex('saltA', 'pw');
    const b = await sha256hex('saltB', 'pw');
    expect(a).not.toBe(b);
  });

  it('verify accepts the right password and rejects the wrong one', async () => {
    if (!cryptoAvailable()) return;
    const salt = 'fixedsalt';
    const hash = await sha256hex(salt, 'correct');
    const profile = { hash, salt };
    expect(await verify(profile, 'correct')).toBe(true);
    expect(await verify(profile, 'wrong')).toBe(false);
  });

  it('password-less profile always verifies true', async () => {
    expect(await verify({ hash: null, salt: 'x' }, '')).toBe(true);
    expect(await verify({ hash: null, salt: 'x' }, 'anything')).toBe(true);
  });

  it('createProfile hashes the password (never stores plaintext)', async () => {
    const p = await createProfile('Tester', 'secret');
    expect(p.name).toBe('Tester');
    if (cryptoAvailable()) {
      expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(p.hash).not.toContain('secret');
      expect(await verify(p, 'secret')).toBe(true);
    }
  });
});
