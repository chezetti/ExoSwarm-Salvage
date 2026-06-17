/* =============================== RNG ==================================== */
// Seeded PRNG for reproducible world-gen and daily runs. mulberry32 — tiny,
// fast, good enough for layout/loot/modifier draws. Pure + unit-testable.
// RULE: seed only what defines a run (layout, loot tables, modifier draws).
// Per-frame cosmetic randomness (AI wobble, particle spread) stays on
// Math.random — do NOT seed the hot loop.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable string → 32-bit seed (for daily date strings like '2026-06-17').
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// rng-aware variants used ONLY in world-gen / loot draws.
function randIn(rng, a, b) {
  return a + rng() * (b - a);
}
function randIntIn(rng, a, b) {
  return Math.floor(randIn(rng, a, b + 1));
}
function pickIn(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export { makeRng, hashStringToSeed, randIn, randIntIn, pickIn };
